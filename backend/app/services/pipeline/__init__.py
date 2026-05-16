from app.services.pipeline.base import BaseProcessor, ProcessingResult
from app.services.pipeline.classifier import FileClassifier, classifier
from app.services.pipeline.image_preprocessor import (
    ImagePreprocessor, PreprocessConfig, QualityReport, OcrReadiness, image_preprocessor,
)
from app.services.pipeline.normalizer import Normalizer, normalizer
from app.services.pipeline.xml_processor import xml_processor
from app.services.pipeline.pdf_text_parser import pdf_text_parser
from app.services.pipeline.xlsx_processor import xlsx_processor


def get_orchestrator(openai_processor=None):
    """Factory function to get PipelineOrchestrator with dependencies."""
    from app.services.pipeline_orchestrator import PipelineOrchestrator
    return PipelineOrchestrator(openai_processor=openai_processor)


__all__ = [
    "BaseProcessor",
    "ProcessingResult",
    "FileClassifier",
    "classifier",
    "ImagePreprocessor",
    "PreprocessConfig",
    "QualityReport",
    "OcrReadiness",
    "image_preprocessor",
    "Normalizer",
    "normalizer",
    "xml_processor",
    "pdf_text_parser",
    "xlsx_processor",
    "get_orchestrator",
]