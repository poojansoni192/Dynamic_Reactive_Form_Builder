# =====================================================
# FASTAPI APPLICATION FOR DYNAMIC FORMS
# =====================================================

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import asyncpg
from typing import AsyncGenerator
import os
from datetime import datetime
import json
from fastapi.encoders import jsonable_encoder
from fastapi import Query

# =====================================================
# PYDANTIC MODELS (Request/Response schemas)
# =====================================================

class GridItem(BaseModel):
    name: str
    showRight: bool = False
    showBelow: bool = False
    gridname: str = ""

class ProcessCreate(BaseModel):
    process_name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    grid_data: List[GridItem] = Field(default_factory=list)

class ProcessUpdate(BaseModel):
    process_name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    grid_data: Optional[List[GridItem]] = None
    is_active: Optional[bool] = None

class ProcessResponse(BaseModel):
    id: str
    process_name: str
    description: Optional[str]
    grid_data: List[GridItem]
    created_at: datetime
    updated_at: datetime
    is_active: bool

class ProcessListResponse(BaseModel):
    id: str
    process_name: str
    description: Optional[str]
    grid_count: int
    created_at: datetime
    is_active: bool

# =====================================================
# DATABASE CONNECTION
# =====================================================

class Database:
    def __init__(self):
        self.pool = None
    
    async def connect(self):
        DATABASE_URL = os.getenv(
            "DATABASE_URL", 
            "postgresql://postgres:1234@127.0.0.1:5432/grid"
        )
        self.pool = await asyncpg.create_pool(DATABASE_URL)
    
    async def disconnect(self):
        if self.pool:
            await self.pool.close()
    
    async def get_connection(self):
        return await self.pool.acquire()
    
    async def release_connection(self, connection):
        await self.pool.release(connection)

database = Database()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # ✅ On startup
    await database.connect()
    yield
    # ✅ On shutdown
    await database.disconnect()


# =====================================================
# FASTAPI APP SETUP
# =====================================================

# Create the FastAPI app with the lifespan handler
app = FastAPI(
    title="Dynamic Forms API",
    description="REST API for managing dynamic forms with JSONB storage",
    version="1.0.0",
    lifespan=lifespan
)
# CORS middleware for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure this for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =====================================================
# DATABASE DEPENDENCY
# =====================================================

async def get_db_connection():
    connection = await database.get_connection()
    try:
        yield connection
    finally:
        await database.release_connection(connection)

# =====================================================
# API ENDPOINTS
# =====================================================

@app.get("/", tags=["Root"])
async def root():
    """Health check endpoint"""
    return {"message": "Dynamic Forms API is running!", "status": "healthy"}


from fastapi.encoders import jsonable_encoder
import json

@app.post("/processes/", response_model=ProcessResponse, tags=["Processes"])
async def create_process(
    process: ProcessCreate,
    connection = Depends(get_db_connection)
):
    """Create a new process with grid data"""
    try:
        # ✅ Properly serialize using FastAPI's jsonable_encoder
        grid_data_encoded = jsonable_encoder(process.grid_data)
        grid_data_json = json.dumps(grid_data_encoded)

        query = """
        INSERT INTO processes_with_json (process_name, description, grid_data)
        VALUES ($1, $2, $3::jsonb)
        RETURNING id, process_name, description, grid_data, created_at, updated_at, is_active
        """

        row = await connection.fetchrow(
            query,
            process.process_name,
            process.description,
            grid_data_json
        )

        # ✅ Ensure grid_data is a list of dicts (not string)
        grid_items = row['grid_data']
        if isinstance(grid_items, str):
            grid_items = json.loads(grid_items)

        return ProcessResponse(
            id=str(row['id']),
            process_name=row['process_name'],
            description=row['description'],
            grid_data=[GridItem(**item) for item in grid_items],
            created_at=row['created_at'],
            updated_at=row['updated_at'],
            is_active=row['is_active']
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@app.get("/processes/", response_model=List[ProcessListResponse], tags=["Processes"])
async def get_processes(
    skip: int = 0,
    limit: int = 100,
    active_only: bool = True,
    connection = Depends(get_db_connection)
):
    """Get all processes with pagination"""
    try:
        where_clause = "WHERE is_active = true" if active_only else ""
        
        query = f"""
        SELECT 
            id, 
            process_name, 
            description, 
            jsonb_array_length(grid_data) as grid_count,
            created_at,
            is_active
        FROM processes_with_json 
        {where_clause}
        ORDER BY created_at DESC
        LIMIT $1 OFFSET $2
        """
        
        rows = await connection.fetch(query, limit, skip)
        
        return [
            ProcessListResponse(
                id=str(row['id']),
                process_name=row['process_name'],
                description=row['description'],
                grid_count=row['grid_count'] or 0,
                created_at=row['created_at'],
                is_active=row['is_active']
            ) for row in rows
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@app.get("/processes/fetch", response_model=ProcessResponse, tags=["Processes"])
async def get_process_by_id_or_name(
    process_id: Optional[int] = Query(None),
    process_name: Optional[str] = Query(None),
    connection = Depends(get_db_connection)
):
    if not process_id and not process_name:
        raise HTTPException(status_code=400, detail="Provide process_id or process_name")

    try:
        if process_id:
            query = """
            SELECT id, process_name, description, grid_data, created_at, updated_at, is_active
            FROM processes_with_json
            WHERE id = $1
            """
            row = await connection.fetchrow(query, process_id)
        else:
            query = """
            SELECT id, process_name, description, grid_data, created_at, updated_at, is_active
            FROM processes_with_json
            WHERE process_name = $1
            """
            row = await connection.fetchrow(query, process_name)

        if not row:
            raise HTTPException(status_code=404, detail="Process not found")

        # Deserialize grid_data if needed
        grid_data = row['grid_data']
        if isinstance(grid_data, str):
            grid_data = json.loads(grid_data)

        return ProcessResponse(
            id=str(row['id']),
            process_name=row['process_name'],
            description=row['description'],
            grid_data=[GridItem(**item) for item in grid_data],
            created_at=row['created_at'],
            updated_at=row['updated_at'],
            is_active=row['is_active']
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching process: {str(e)}")
    

@app.put("/processes/{process_id}", response_model=ProcessResponse, tags=["Processes"])
async def update_process(
    process_id: int,
    process_update: ProcessUpdate,
    connection = Depends(get_db_connection)
):
    """Update a specific process"""
    try:
        # Build dynamic update query
        update_fields = []
        values = []
        param_count = 1
        
        if process_update.process_name is not None:
            update_fields.append(f"process_name = ${param_count}")
            values.append(process_update.process_name)
            param_count += 1
        
        if process_update.description is not None:
            update_fields.append(f"description = ${param_count}")
            values.append(process_update.description)
            param_count += 1
        
        if process_update.grid_data is not None:
            update_fields.append(f"grid_data = ${param_count}::jsonb")
            values.append(json.dumps([item.dict() for item in process_update.grid_data]))
            param_count += 1
        
        if process_update.is_active is not None:
            update_fields.append(f"is_active = ${param_count}")
            values.append(process_update.is_active)
            param_count += 1
        
        if not update_fields:
            raise HTTPException(status_code=400, detail="No fields to update")
        
        values.append(process_id)  # ✅ use as integer
        
        query = f"""
        UPDATE processes_with_json 
        SET {', '.join(update_fields)}
        WHERE id = ${param_count}
        RETURNING id, process_name, description, grid_data, created_at, updated_at, is_active
        """
        
        row = await connection.fetchrow(query, *values)
        
        if not row:
            raise HTTPException(status_code=404, detail="Process not found")
        
        return ProcessResponse(
            id=str(row['id']),
            process_name=row['process_name'],
            description=row['description'],
            grid_data=[GridItem(**item) if isinstance(item, dict) else GridItem(name="unknown", gridname=str(item))
                        for item in row['grid_data']],
            created_at=row['created_at'],
            updated_at=row['updated_at'],
            is_active=row['is_active']
        )
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid process ID format")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.delete("/processes/{process_id}", tags=["Processes"])
async def delete_process(
    process_id: int,
    soft_delete: bool = True,
    connection = Depends(get_db_connection)
):
    """Delete a process (soft delete by default)"""
    try:
        if soft_delete:
            query = """
            UPDATE processes_with_json 
            SET is_active = false 
            WHERE id = $1
            RETURNING id
            """
        else:
            query = """
            DELETE FROM processes_with_json 
            WHERE id = $1
            RETURNING id
            """
        
        row = await connection.fetchrow(query, int(process_id))
        
        if not row:
            raise HTTPException(status_code=404, detail="Process not found")
        
        action = "deactivated" if soft_delete else "deleted"
        return {"message": f"Process {action} successfully", "id": str(row['id'])}
        
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid process ID format")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.get("/processes/search/{search_term}", response_model=List[ProcessListResponse], tags=["Processes"])
async def search_processes(
    search_term: str,
    connection = Depends(get_db_connection)
):
    """Search processes by name or grid content"""
    try:
        query = """
        SELECT     
            id, 
            process_name, 
            description, 
            jsonb_array_length(grid_data) as grid_count,
            created_at,
            is_active
        FROM processes_with_json 
        WHERE (process_name ILIKE $1 OR description ILIKE $1)
        OR grid_data::text ILIKE $1
        AND is_active = true
        ORDER BY created_at DESC
        """
        
        search_pattern = f"%{search_term}%"
        rows = await connection.fetch(query, search_pattern)
        
        return [
            ProcessListResponse(
                id=str(row['id']),
                process_name=row['process_name'],
                description=row['description'],
                grid_count=row['grid_count'] or 0,
                created_at=row['created_at'],
                is_active=row['is_active']
            ) for row in rows
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

# =====================================================
# RUN THE APPLICATION
# =====================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)