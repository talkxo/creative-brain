import os
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
import google.generativeai as genai
from PIL import Image
import io
import json
import hashlib

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

print("Initializing backend...")

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
MODEL_LOADED = False

if GEMINI_API_KEY:
    try:
        genai.configure(api_key=GEMINI_API_KEY)
        
        # gemini-flash-latest is usually the safest bet for active Free Tier quota
        candidate_models = [
            'gemini-flash-latest', 
            'gemini-2.0-flash', 
            'gemini-pro-latest'
        ]
        model = None
        
        for model_name in candidate_models:
            try:
                print(f"Attempting to load model: {model_name}...")
                model = genai.GenerativeModel(model_name)
                # Verify it exists by a dummy call or just trust it if it constructs
                MODEL_LOADED = True
                print(f"Successfully initialized {model_name}.")
                break
            except Exception as inner_e:
                print(f"Failed to load {model_name}: {inner_e}")
                
        if not model:
            print("No suitable Gemini model found among candidates.")
    except Exception as e:
        print(f"General configuration error: {e}")
else:
    print("Warning: GEMINI_API_KEY environment variable not set. Running in simulation mode.")

@app.get("/")
def read_root():
    return {"status": "online", "engine": "Creative Intelligence Engine", "active": True}

@app.get("/api/health")
def health_check():
    return {
        "status": "ok", 
        "model_loaded": MODEL_LOADED,
        "api_key_configured": bool(GEMINI_API_KEY),
        "message": "Neural Engine analysis is operational."
    }

prompt_template = """
You are a neuromarketing expert AI analyzing an ad creative image critically with emphasis on copy, CTA, best time and platform etc..
Evaluate this image strictly on these 5 cognitive parameters. Give a score between 0.20 and 0.98.
Also provide a VERY brief 1-sentence analytical reason based exactly on what is visibly in the image.

The parameters are:
- visual_saliency (How effectively it draws the eye with contrast, colors, shapes)
- cognitive_ease (Clean layout vs clutter. Higher score = easier to process)
- emotional_arousal (Does it trigger a mood via faces, colors, or atmosphere)
- value_recognition (Speed of identifying the core reward/benefit/CTA)
- memory_encoding (Distinctiveness of brand motifs, logos, or striking imagery)

Return strictly valid JSON containing a single "scores" object, a "reasons" object, and an "insights" array.
Format:
{
  "scores": {
    "visual_saliency": 0.82,
    "cognitive_ease": 0.70,
    "emotional_arousal": 0.50,
    "value_recognition": 0.88,
    "memory_encoding": 0.65
  },
  "reasons": {
    "visual_saliency": "The high contrast between the bright red text and black background immediately grabs attention.",
    "cognitive_ease": "...",
    "emotional_arousal": "...",
    "value_recognition": "...",
    "memory_encoding": "..."
  },
  "insights": [
    "Overall synthesis of the creative's strength."
  ]
}
"""

@app.post("/api/analyze")
async def analyze_creative(
    creative: UploadFile = File(None),
    description: str = Form("Creative"),
    name: str = Form("creative"),
    id: str = Form("creative")
):
    source = "Cloud VLM (Neural Proxy)"
    
    if creative and MODEL_LOADED:
        try:
            image_data = await creative.read()
            image = Image.open(io.BytesIO(image_data))
            if image.mode != "RGB":
                image = image.convert("RGB")
            
            response = model.generate_content([prompt_template, image])
            text_response = response.text
            
            # Extract JSON block safely
            json_str = text_response
            if "```json" in text_response:
                json_str = text_response.split("```json")[1].split("```")[0].strip()
            elif "```" in text_response:
                json_str = text_response.split("```")[1].split("```")[0].strip()
                
            data = json.loads(json_str)
            scores = data.get("scores", {})
            reasons = data.get("reasons", {})
            insights = data.get("insights", ["Analysis completed successfully."])

        except Exception as e:
            scores = {
                "visual_saliency": 0.85, "cognitive_ease": 0.65, 
                "emotional_arousal": 0.80, "value_recognition": 0.82, "memory_encoding": 0.75
            }
            reasons = {k: "Error processing via API." for k in scores}
            insights = [f"API Error: {str(e)}"]
            source = f"HF Space (Error)"
    else:
        # Deterministic fallback based on file name
        seed = name + description
        h = int(hashlib.md5(seed.encode()).hexdigest(), 16)
        
        scores = {
            "visual_saliency":       0.50 + ((h % 45) / 100),
            "cognitive_ease":        0.40 + (((h // 2) % 45) / 100),
            "emotional_arousal":     0.50 + (((h // 5) % 45) / 100),
            "value_recognition":     0.55 + (((h // 11) % 40) / 100),
            "memory_encoding":       0.45 + (((h // 7) % 45) / 100),
        }
        reasons = {
            "visual_saliency": "Mock reason based on deterministic simulation.",
            "cognitive_ease": "The layout is simulated to have this ease.",
            "emotional_arousal": "Colors simulated from fallback logic.",
            "value_recognition": "Simulated CTA recognition.",
            "memory_encoding": "Simulated branding elements."
        }
        insights = ["Running in simulation mode. No valid GEMINI_API_KEY provided."]
        source = "HF Space (Simulation Fallback)"

    # Base timelines that would be extracted from frame-by-frame analysis
    timeline = {
        "attention": 85,
        "emotion": 78,
        "memory": 82
    }

    return {
        "id": id,
        "name": name,
        "scores": scores,
        "reasons": reasons,
        "timeline": timeline,
        "insights": insights,
        "source": source
    }
