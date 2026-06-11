from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    gemini_api_key: str = ""
    mongodb_uri: str = ""
    mongodb_db: str = "crisispilot"

    # Dynatrace MCP (partner integration). DT_ENVIRONMENT must be the platform URL
    # (https://<env-id>.apps.dynatrace.com) — NOT the account-management URL.
    dt_environment: str = ""
    dt_platform_token: str = ""

    # Google Cloud Agent Builder (ADK). When on (and a Gemini key is present),
    # agents reason via real ADK LlmAgent constructs run through ADK's Runner.
    crisispilot_use_adk: bool = True

    crisispilot_autostart_simulator: bool = True
    crisispilot_incident_interval_seconds: int = 45

    @property
    def use_real_gemini(self) -> bool:
        return bool(self.gemini_api_key)

    @property
    def use_adk(self) -> bool:
        # ADK needs a Gemini key (routed to AI Studio via google-genai).
        return self.crisispilot_use_adk and self.use_real_gemini

    @property
    def use_real_mongo(self) -> bool:
        return bool(self.mongodb_uri)

    @property
    def use_real_dynatrace(self) -> bool:
        return bool(self.dt_environment and self.dt_platform_token)


settings = Settings()
