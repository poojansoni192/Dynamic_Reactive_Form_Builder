import { inject } from '@angular/core';
import { Component } from '@angular/core';
import {
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  AbstractControl
} from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ProcessService } from './process.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  gridForm: FormArray;
  formHeader: FormGroup;

  editProcessId: string | null = null;
  
  private processService = inject(ProcessService);
  private fb = inject(FormBuilder);
  private http = inject(HttpClient);

  // Cache the grouped controls to prevent recreation
  private _groupedControls: { [main: number]: AbstractControl[] } = {};
  private _groupedControlsCache: any = null;

  constructor() {
    this.gridForm = this.fb.array([this.createGridFormGroup(1, 0, true, true)]);
    this.formHeader = this.fb.group({
      processName: ['']
    });
    
    // Update grouped controls initially
    this.updateGroupedControls();
    
    // Subscribe to form changes to update grouped controls
    this.gridForm.valueChanges.subscribe(() => {
      this.updateGroupedControls();
    });
  }

  createGridFormGroup(main: number, sub: number, showRight: boolean, showBelow: boolean): FormGroup {
    return this.fb.group({
      name: `${main}.${sub}`,
      showRight,
      showBelow,
      gridname: ''
    });
  }

  asFormGroup(control: AbstractControl): FormGroup {
    return control as FormGroup;
  }

  // Convert getter to method and cache the result
  private updateGroupedControls(): void {
    const groups: { [main: number]: AbstractControl[] } = {};
    this.gridForm.controls.forEach(control => {
      const [main] = control.value.name.split('.').map(Number);
      if (!groups[main]) groups[main] = [];
      groups[main].push(control);
    });
    this._groupedControls = groups;
    this._groupedControlsCache = Object.entries(groups).map(([key, value]) => ({
      key: Number(key),
      value
    })).sort((a, b) => a.key - b.key);
  }

  // Return cached grouped controls
  get groupedControls(): any[] {
    return this._groupedControlsCache || [];
  }

  getPaddedGroups(groups: AbstractControl[]): (AbstractControl | null)[] {
  const maxSub = Math.max(
    ...groups.map(ctrl => Number(ctrl.value.name.split('.')[1]))
  );

  const padded: (AbstractControl | null)[] = [];

  for (let i = 0; i <= maxSub; i++) {
    const found = groups.find(ctrl => Number(ctrl.value.name.split('.')[1]) === i);
    padded.push(found || null);
  }

  return padded;
  }

  // Add trackBy function for better performance
  trackByMainGroup(index: number, item: any): any {
    return item.key;
  }

  trackBySubGroup(index: number, item: AbstractControl): any {
    return item.value.name;
  }

  sortByKey = (a: any, b: any) => a.key - b.key;

  getIndex(group: AbstractControl): number {
    return this.gridForm.controls.indexOf(group);
  }

  addBelow(index: number): void {
    const current = this.gridForm.at(index).value.name;
    const [main, sub] = current.split('.').map(Number);
    const newSub = sub + 1;

    (this.gridForm.at(index) as FormGroup).patchValue({ showBelow: false });

    this.gridForm.insert(index + 1, this.createGridFormGroup(main, newSub, true, true));

    for (let i = index + 2; i < this.gridForm.length; i++) {
      const [m, s] = this.gridForm.at(i).value.name.split('.').map(Number);
      if (m === main) {
        const updatedSub = newSub + (i - index - 1);
        (this.gridForm.at(i) as FormGroup).patchValue({ name: `${main}.${updatedSub}` });
      }
    }
    
    // Update grouped controls after modification
    this.updateGroupedControls();
  }

  addRight(index: number): void {
  const currentName = this.gridForm.at(index).value.name;
  const [currentMain, currentSub] = currentName.split('.').map(Number);
  const newMain = currentMain + 1;
  const newName = `${newMain}.${currentSub}`;

  // Hide the Add Right button of the current cell
  (this.gridForm.at(index) as FormGroup).patchValue({ showRight: false });

  const alreadyExists = this.gridForm.controls.some(
    ctrl => ctrl.value.name === newName
  );

  if (!alreadyExists) {
    const insertIndex = this.findInsertIndexForRight(newMain, currentSub);
    this.gridForm.insert(insertIndex, this.createGridFormGroup(newMain, currentSub, true, true));

    // ✅ NEW LOGIC: Hide the Add Below of the cell just above the newly created one
    const aboveName = `${newMain}.${currentSub - 1}`;
    const aboveControl = this.gridForm.controls.find(ctrl => ctrl.value.name === aboveName);
    if (aboveControl) {
      (aboveControl as FormGroup).patchValue({ showBelow: false });
    }
  }

  this.updateGroupedControls();
}

  findInsertIndexForRight(main: number, sub: number): number {
    for (let i = 0; i < this.gridForm.length; i++) {
      const [m, s] = this.gridForm.at(i).value.name.split('.').map(Number);
      if (m > main || (m === main && s > sub)) {
        return i;
      }
    }
    return this.gridForm.length;
  }

  remove(index: number): void {
    const name = this.gridForm.at(index).value.name;
    const [mainToRemove, subToRemove] = name.split('.').map(Number);

    if (mainToRemove === 1 && subToRemove === 0) {
      // If 1.0 is the only column, reset the form
      const onlyColumn = this.gridForm.controls.every(ctrl => ctrl.value.name.startsWith('1.'));
      if (onlyColumn) {
        this.gridForm.clear();
        this.gridForm.push(this.createGridFormGroup(1, 0, true, true));
        this.updateGroupedControls();
        return;
      }
    }

    // If it's a top-level cell like 1.0, remove the whole column
    if (subToRemove === 0) {
      // Step 1: Remove all controls belonging to the column
      for (let i = this.gridForm.length - 1; i >= 0; i--) {
        const [main] = this.gridForm.at(i).value.name.split('.').map(Number);
        if (main === mainToRemove) {
          this.gridForm.removeAt(i);
        }
      }

      // Step 2: Shift all columns > mainToRemove one step left (main - 1)
      const tempControls: FormGroup[] = [];
      const grouped = this._groupedControls;
      const newGrouped: { [main: number]: AbstractControl[] } = {};

      const sortedKeys = Object.keys(grouped).map(Number).sort((a, b) => a - b);

      let newMain = 1;
      for (const main of sortedKeys) {
        if (main === mainToRemove) continue; // skip removed column
        const controls = grouped[main];

        controls.forEach((control, subIndex) => {
          const oldForm = this.asFormGroup(control);
          const newForm = this.createGridFormGroup(
            newMain,
            subIndex,
            subIndex === 0,
            subIndex === controls.length - 1
          );
          newForm.patchValue({
            gridname: oldForm.get('gridname')?.value
          });
          tempControls.push(newForm);
        });

        newMain++;
      }

      // Step 3: Clear and repopulate gridForm
      this.gridForm.clear();
      tempControls.forEach(ctrl => this.gridForm.push(ctrl));
    } else {
      // Remove sub-row (not top-level)
      this.gridForm.removeAt(index);

      // Only shift items that come AFTER the removed item in the same column
      for (let i = 0; i < this.gridForm.length; i++) {
        const control = this.asFormGroup(this.gridForm.at(i));
        const [m, s] = control.get('name')?.value.split('.').map(Number);
        
        // If it's the same column and sub-number is greater than the removed one
        if (m === mainToRemove && s > subToRemove) {
          // Shift the sub-number down by 1
          control.patchValue({ 
            name: `${mainToRemove}.${s - 1}`,
            showBelow: false
          });
        }
      }

      // Find the last item in this column and set showBelow to true
      let lastSubInColumn = -1;
      let lastControlIndex = -1;
      
      for (let i = 0; i < this.gridForm.length; i++) {
        const control = this.asFormGroup(this.gridForm.at(i));
        const [m, s] = control.get('name')?.value.split('.').map(Number);
        if (m === mainToRemove && s > lastSubInColumn) {
          lastSubInColumn = s;
          lastControlIndex = i;
        }
      }
      
      if (lastControlIndex >= 0) {
        this.asFormGroup(this.gridForm.at(lastControlIndex)).patchValue({ showBelow: true });
      }

      // ✅ Don't touch other columns!
    }

    // Update grouped controls after modification
    this.updateGroupedControls();
  }

  // Handle Final Submission
  submitForm(): void {
    const processName = this.formHeader.get('processName')?.value;
    const gridData = this.gridForm.value;

    const finalData = {
      process_name: processName,
      description: "Submitted from Angular",
      grid_data: gridData
    };

    if (this.editProcessId) {
      // ✅ PUT (update)
      this.http.put(`http://localhost:8000/processes/${this.editProcessId}`, finalData).subscribe({
        next: (response) => {
          console.log('✅ Successfully updated:', response);
          alert('Process updated successfully!');

          // ✅ Auto reload updated process
          this.loadProcess();  // 👈 Auto refresh

          // Optionally clear editProcessId if you want to allow “save as new”
          // this.editProcessId = null;
        },
        error: (error) => {
          console.error('❌ Error updating form data:', error);
          alert('Failed to update process.');
        }
      });
    } else {
      // ✅ POST (create new)
      this.http.post('http://localhost:8000/processes/', finalData).subscribe({
        next: (response: any) => {
          console.log('✅ Successfully created:', response);
          alert('Form submitted successfully!');

          // ✅ Set ID so further saves are treated as updates
          this.editProcessId = response.id;

          // ✅ Auto reload the newly created one
          this.loadProcess();
        },
        error: (error) => {
          console.error('❌ Error posting form data:', error);
          alert('Failed to submit form.');
        }
      });
    }
  }


  loadProcess(): void {
    const processName = this.formHeader.get('processName')?.value?.trim();
    
    if (!processName) {
      console.error('Please enter a process name');
      return;
    }

    this.processService.getProcessByIdOrName(undefined, processName).subscribe({
      next: (process) => {
        console.log('Process loaded:', process);
        console.log("Loaded process ID:", process.id);
        this.editProcessId = process.id;  // 🟢 Save the process ID
        this.populateFormWithGridData(process.grid_data);
        this.formHeader.patchValue({ processName: process.process_name });
      },
      error: (error) => {
        console.error('Error loading process:', error);
      }
    });
  }

  populateFormWithGridData(gridData: any[]): void {
    // Clear existing form array
    this.gridForm.clear();

    // Add each grid item to the form
    gridData.forEach(item => {
      const itemGroup = this.fb.group({
        name: [item.name],
        gridname: [item.gridname],
        showRight: [item.showRight],
        showBelow: [item.showBelow]
      });
      this.gridForm.push(itemGroup);
    });

    // Update grouped controls for display
    this.updateGroupedControls();
  }
}