import os
from dotenv import load_dotenv

load_dotenv()

key = os.getenv("API_KEY_OPENAI")

if key == None:
    raise ValueError("Enviroment is required")

API_KEY = key

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
MONGODB_DB = os.getenv("MONGODB_DB", "chat_gpt_clone")
SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-me")