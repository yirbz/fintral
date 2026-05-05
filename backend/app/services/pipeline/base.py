from abc import ABC, abstractmethod
from typing import Any, Dict, Optional
from dataclasses import dataclass


@dataclass
class ProcessingResult:
    success: bool
    data: Optional[Dict[str, Any]] = None
    source_type: Optional[str] = None
    confidence: float = 0.0
    warnings: list[str] = None
    error: Optional[str] = None

    def __post_init__(self):
        if self.warnings is None:
            self.warnings = []


class BaseProcessor(ABC):
    """Abstract base for all pipeline processors."""

    name: str = "base"

    @abstractmethod
    def can_process(self, file_path: str, file_type: str) -> bool:
        """Check if this processor can handle the given file."""
        pass

    @abstractmethod
    def process(self, file_path: str, **kwargs) -> ProcessingResult:
        """Process the file and return normalized data."""
        pass

    def extract_text(self, file_path: str) -> str:
        """Optional: Extract raw text for analysis."""
        return ""