import os
from pathlib import Path
from dotenv import load_dotenv

# Search for .env.local first, then .env
root_dir = Path(__file__).resolve().parent.parent
env_local_path = root_dir / ".env.local"
env_path = root_dir / ".env"

if env_local_path.exists():
    load_dotenv(dotenv_path=env_local_path)
elif env_path.exists():
    load_dotenv(dotenv_path=env_path)
else:
    load_dotenv()

# LLM Providers Configuration
NEXT_PUBLIC_LLM_PROVIDER = os.getenv("NEXT_PUBLIC_LLM_PROVIDER", "gemini")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")
GEMINI_EMBEDDING_MODEL = os.getenv("GEMINI_EMBEDDING_MODEL", "gemini-embedding-2")

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_API_BASE = os.getenv("GROQ_API_BASE", "https://api.groq.com/openai/v1")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.2-11b-vision-preview")

OLLAMA_API_BASE = os.getenv("OLLAMA_API_BASE", "http://localhost:11434/v1")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "gemma2")

LLAMACPP_API_BASE = os.getenv("LLAMACPP_API_BASE", "http://localhost:8080/v1")
LLAMACPP_MODEL = os.getenv("LLAMACPP_MODEL", "default")

# Supabase Configuration
SUPABASE_URL = (
    os.getenv("NEXT_PUBLIC_SUPABASE_URL") or os.getenv("SUPABASE_URL") or ""
).strip()

def get_valid_supabase_key() -> str:
    # Notice: Keys starting with 'sbp_' are CLI management tokens, not PostgREST keys
    service_key = (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    if service_key and not service_key.startswith("sbp_") and "placeholder" not in service_key and len(service_key) > 10:
        return service_key
    
    anon_key = (
        os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY") or os.getenv("SUPABASE_ANON_KEY") or ""
    ).strip()
    if anon_key and "placeholder" not in anon_key and len(anon_key) > 10:
        return anon_key
    return ""

SUPABASE_KEY = get_valid_supabase_key()
