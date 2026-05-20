from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from services.dashboard_service import router as dashboard_router
from services.recycling_service import router as recycling_router
from services.cards_service import router as cards_router
from services.layout import router as layout_router
from services.excel_api import router as excel_router

app = FastAPI(title="Water Management Excel API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {
        "status": "success",
        "message": "Water Management Excel API Running"
    }


app.include_router(dashboard_router)
app.include_router(recycling_router)
app.include_router(cards_router)
app.include_router(layout_router)
app.include_router(excel_router)



if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
