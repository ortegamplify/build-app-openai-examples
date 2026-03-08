import os
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

api_key = os.getenv("API_KEY_OPENAI")

if api_key == None:
	raise ValueError("API KEY NOT FOUND, IS REQUIRED")

client = OpenAI(api_key=api_key)

question = input("What would you like to ask ChatGPT: ")

# Create a funtion to use the chatGPT API

response = client.chat.completions.create(
    model="gpt-3.5-turbo",
    messages=[
        {"role": "user", "content": f"{question}"},
    ],
    max_tokens=512,
    n=1,
    stop=None,
    temperature=0.8
)

print(response.to_json())
