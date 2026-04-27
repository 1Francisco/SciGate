import os
import google.generativeai as genai

genai.configure(api_key=os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"))

try:
    print("Listing models...")
    for m in genai.list_models():
        if 'embedContent' in m.supported_generation_methods:
            print(f"Name: {m.name}, Methods: {m.supported_generation_methods}")
except Exception as e:
    print(f"Error listing models: {e}")
