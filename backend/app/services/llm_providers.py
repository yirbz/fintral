import logging
import time
import requests
from abc import ABC, abstractmethod
from typing import Dict, Optional, List
import openai

logger = logging.getLogger(__name__)

class LLMResponse:
    """Standardized response from any LLM provider."""
    def __init__(self, content: str, input_tokens: int = 0, output_tokens: int = 0):
        self.content = content
        self.input_tokens = input_tokens
        self.output_tokens = output_tokens

class LLMProvider(ABC):
    """Abstract interface for LLM services."""
    def __init__(self, model_name: str):
        self.model_name = model_name

    @abstractmethod
    def process_image(self, prompt: str, base64_image: str, mime_type: str) -> LLMResponse:
        """Processes an image with a text prompt and returns the standardized response."""
        pass

    @abstractmethod
    def process_text(self, prompt: str) -> LLMResponse:
        """Processes a text prompt and returns the standardized response."""
        pass

    @abstractmethod
    def chat(self, messages: List[Dict[str, str]], temperature: float = 0.3, max_tokens: int = 500) -> LLMResponse:
        """Executes a chat completion query and returns the standardized response."""
        pass


class OpenAIProvider(LLMProvider):
    """OpenAI API wrapper implementing LLMProvider."""
    def __init__(self, api_key: str, model_name: str):
        super().__init__(model_name)
        self.client = openai.OpenAI(api_key=api_key)

    def process_image(self, prompt: str, base64_image: str, mime_type: str) -> LLMResponse:
        response = self.client.chat.completions.create(
            model=self.model_name,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{mime_type};base64,{base64_image}"
                            }
                        }
                    ]
                }
            ],
            max_tokens=2000,
            temperature=0.1
        )
        content = response.choices[0].message.content or ""
        input_tokens = response.usage.prompt_tokens if response.usage else 0
        output_tokens = response.usage.completion_tokens if response.usage else 0
        return LLMResponse(content.strip(), input_tokens, output_tokens)

    def process_text(self, prompt: str) -> LLMResponse:
        response = self.client.chat.completions.create(
            model=self.model_name,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=2000,
            temperature=0.1
        )
        content = response.choices[0].message.content or ""
        input_tokens = response.usage.prompt_tokens if response.usage else 0
        output_tokens = response.usage.completion_tokens if response.usage else 0
        return LLMResponse(content.strip(), input_tokens, output_tokens)

    def chat(self, messages: List[Dict[str, str]], temperature: float = 0.3, max_tokens: int = 500) -> LLMResponse:
        response = self.client.chat.completions.create(
            model=self.model_name,
            messages=messages, # type: ignore
            max_tokens=max_tokens,
            temperature=temperature
        )
        content = response.choices[0].message.content or ""
        input_tokens = response.usage.prompt_tokens if response.usage else 0
        output_tokens = response.usage.completion_tokens if response.usage else 0
        return LLMResponse(content.strip(), input_tokens, output_tokens)


class GeminiProvider(LLMProvider):
    """Google Gemini API wrapper using direct HTTP requests implementing LLMProvider."""
    def __init__(self, api_key: str, model_name: str):
        super().__init__(model_name)
        self.api_key = api_key
        self.base_url = "https://generativelanguage.googleapis.com/v1beta/models"

    def _call_gemini(self, url: str, payload: dict, max_retries: int = 3, timeout: float = 60.0) -> dict:
        last_resp = None
        for attempt in range(max_retries):
            try:
                resp = requests.post(url, json=payload, timeout=timeout)
                if resp.status_code == 200:
                    return resp.json()
                last_resp = resp
                if resp.status_code in (429, 500, 502, 503):
                    if attempt < max_retries - 1:
                        wait = 2 ** attempt
                        logger.warning("Gemini API error %d, retrying in %ds (attempt %d/%d)", resp.status_code, wait, attempt + 1, max_retries)
                        time.sleep(wait)
                        continue
                break
            except Exception as e:
                logger.error("Exception during Gemini API call: %s", e)
                if attempt < max_retries - 1:
                    time.sleep(2 ** attempt)
                    continue
                raise e
        
        err_msg = last_resp.text if last_resp else "Connection failed"
        raise ValueError(f"Gemini API Error: {err_msg}")

    def process_image(self, prompt: str, base64_image: str, mime_type: str) -> LLMResponse:
        url = f"{self.base_url}/{self.model_name}:generateContent?key={self.api_key}"
        payload = {
            "contents": [{
                "parts": [
                    {"text": prompt + "\n\nResponde estrictamente con JSON válido."},
                    {"inlineData": {"mimeType": mime_type, "data": base64_image}}
                ]
            }],
            "generationConfig": {
                "temperature": 0.1,
                "responseMimeType": "application/json"
            }
        }
        res_json = self._call_gemini(url, payload)
        content = res_json["candidates"][0]["content"]["parts"][0]["text"]
        usage = res_json.get("usageMetadata", {})
        return LLMResponse(
            content=content.strip(),
            input_tokens=usage.get("promptTokenCount", 0),
            output_tokens=usage.get("candidatesTokenCount", 0)
        )

    def process_text(self, prompt: str) -> LLMResponse:
        url = f"{self.base_url}/{self.model_name}:generateContent?key={self.api_key}"
        payload = {
            "contents": [{
                "parts": [
                    {"text": prompt + "\n\nResponde estrictamente con JSON válido."}
                ]
            }],
            "generationConfig": {
                "temperature": 0.1,
                "responseMimeType": "application/json"
            }
        }
        res_json = self._call_gemini(url, payload)
        content = res_json["candidates"][0]["content"]["parts"][0]["text"]
        usage = res_json.get("usageMetadata", {})
        return LLMResponse(
            content=content.strip(),
            input_tokens=usage.get("promptTokenCount", 0),
            output_tokens=usage.get("candidatesTokenCount", 0)
        )

    def chat(self, messages: List[Dict[str, str]], temperature: float = 0.3, max_tokens: int = 500) -> LLMResponse:
        url = f"{self.base_url}/{self.model_name}:generateContent?key={self.api_key}"
        
        system_instruction = None
        gemini_contents = []
        for msg in messages:
            role = msg.get("role")
            content = msg.get("content") or ""
            if role == "system":
                system_instruction = {"parts": [{"text": content}]}
            else:
                gemini_role = "user" if role == "user" else "model"
                gemini_contents.append({
                    "role": gemini_role,
                    "parts": [{"text": content}]
                })
        
        payload = {
            "contents": gemini_contents,
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_tokens
            }
        }
        if system_instruction:
            payload["systemInstruction"] = system_instruction

        res_json = self._call_gemini(url, payload)
        content = res_json["candidates"][0]["content"]["parts"][0]["text"]
        usage = res_json.get("usageMetadata", {})
        return LLMResponse(
            content=content.strip(),
            input_tokens=usage.get("promptTokenCount", 0),
            output_tokens=usage.get("candidatesTokenCount", 0)
        )


class OllamaProvider(LLMProvider):
    """Local Ollama instance wrapper implementing LLMProvider."""
    def __init__(self, host: str, model_name: str):
        super().__init__(model_name)
        self.host = host

    def process_image(self, prompt: str, base64_image: str, mime_type: str) -> LLMResponse:
        url = f"{self.host}/api/chat"
        payload = {
            "model": self.model_name,
            "messages": [{
                "role": "user",
                "content": prompt + "\n\nResponde SOLO con JSON válido, sin texto adicional.",
                "images": [base64_image]
            }],
            "stream": False,
            "options": {"temperature": 0.1}
        }
        resp = requests.post(url, json=payload, timeout=300.0)
        if resp.status_code == 200:
            content = resp.json()["message"]["content"].strip()
            return LLMResponse(content)
        raise ValueError(f"Ollama Error: {resp.text}")

    def process_text(self, prompt: str) -> LLMResponse:
        url = f"{self.host}/api/chat"
        payload = {
            "model": self.model_name,
            "messages": [{
                "role": "user",
                "content": prompt + "\n\nResponde SOLO con JSON válido, sin texto adicional."
            }],
            "stream": False,
            "options": {"temperature": 0.1}
        }
        resp = requests.post(url, json=payload, timeout=300.0)
        if resp.status_code == 200:
            content = resp.json()["message"]["content"].strip()
            return LLMResponse(content)
        raise ValueError(f"Ollama Error: {resp.text}")

    def chat(self, messages: List[Dict[str, str]], temperature: float = 0.3, max_tokens: int = 500) -> LLMResponse:
        url = f"{self.host}/api/chat"
        # Ollama supports standard message format directly
        payload = {
            "model": self.model_name,
            "messages": messages,
            "stream": False,
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens
            }
        }
        resp = requests.post(url, json=payload, timeout=300.0)
        if resp.status_code == 200:
            content = resp.json()["message"]["content"].strip()
            return LLMResponse(content)
        raise ValueError(f"Ollama Error: {resp.text}")


class LLMProviderFactory:
    """Factory to instantiate the appropriate LLMProvider based on Model Name and API Key."""

    @staticmethod
    def detect_provider_type(api_key: str, configured_model: str) -> str:
        """Detect provider type: 'gemini', 'openai', or 'ollama'.

        Uses the model name as the primary signal (stable, human-readable),
        and falls back to key prefix detection for backward compatibility.
        """
        key_lower = api_key.lower()
        model_lower = configured_model.lower()

        # 1. Explicit Ollama keyword
        if key_lower in ("ollama", "local"):
            return "ollama"

        # 2. Model name detection (stable — won't change format)
        if "gemini" in model_lower:
            return "gemini"
        if "gpt-" in model_lower:
            return "openai"

        # 3. Key prefix detection (backward compat)
        if api_key.startswith("AIza"):
            return "gemini"

        # 4. Default
        return "openai"

    @staticmethod
    def get_provider(api_key: Optional[str], configured_model: str, ollama_host: str = "http://localhost:11434", ollama_model: str = "gemma4:e2b-it-q4_K_M") -> LLMProvider:
        if not api_key:
            raise ValueError("API Key is not configured.")

        provider_type = LLMProviderFactory.detect_provider_type(api_key, configured_model)

        if provider_type == "ollama":
            model = ollama_model if "gemini" in configured_model or "gpt-" in configured_model else configured_model
            return OllamaProvider(host=ollama_host, model_name=model)

        if provider_type == "gemini":
            model = configured_model if "gemini" in configured_model else "gemini-2.0-flash"
            return GeminiProvider(api_key=api_key, model_name=model)

        # Default: OpenAI
        model = configured_model if "gpt-" in configured_model else "gpt-4o"
        return OpenAIProvider(api_key=api_key, model_name=model)
