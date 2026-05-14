import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional, Tuple

import cv2
import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)


class OcrReadiness(Enum):
    GOOD = "good"
    FAIR = "fair"
    POOR = "poor"
    UNUSABLE = "unusable"


@dataclass
class QualityReport:
    blur_score: float = 0.0
    brightness: float = 0.0
    contrast: float = 0.0
    text_density: float = 0.0
    has_glare: bool = False
    is_too_dark: bool = False
    is_too_bright: bool = False
    skew_angle: float = 0.0
    ocr_readiness: OcrReadiness = OcrReadiness.GOOD
    warnings: list[str] = field(default_factory=list)

    @property
    def readiness_label(self) -> str:
        return self.ocr_readiness.value


@dataclass
class PreprocessConfig:
    auto_crop: bool = True
    deskew: bool = True
    denoise: bool = True
    clahe: bool = True
    adaptive_threshold: bool = True
    morphological_clean: bool = True
    sharpen: bool = False
    clahe_clip_limit: float = 3.0
    clahe_tile_size: int = 8
    denoise_h: float = 10.0
    adaptive_block_size: int = 31
    adaptive_c: int = 5
    sharpen_strength: float = 1.5
    max_image_dimension: int = 4000
    min_image_dimension: int = 300


class ImagePreprocessor:

    def __init__(self, config: Optional[PreprocessConfig] = None):
        self.config = config or PreprocessConfig()

    def analyze_quality(self, img: np.ndarray) -> QualityReport:
        if len(img.shape) == 3:
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        else:
            gray = img

        report = QualityReport()

        report.blur_score = self._calculate_blur_score(gray)
        report.brightness = float(np.mean(gray))
        report.contrast = float(np.std(gray))

        if report.blur_score < 100:
            report.ocr_readiness = OcrReadiness.POOR
            report.warnings.append(
                f"Imagen borrosa (score: {report.blur_score:.0f}). "
                "Toma la foto con mejor enfoque."
            )
        elif report.blur_score < 200:
            if report.ocr_readiness == OcrReadiness.GOOD:
                report.ocr_readiness = OcrReadiness.FAIR

        if report.brightness < 40:
            report.is_too_dark = True
            report.ocr_readiness = OcrReadiness.POOR
            report.warnings.append(
                "Imagen muy oscura. Toma la foto con mejor iluminación."
            )
        elif report.brightness > 220:
            report.is_too_bright = True
            if report.ocr_readiness.value in ("good", "fair"):
                report.ocr_readiness = OcrReadiness.FAIR

        if report.contrast < 30:
            report.ocr_readiness = OcrReadiness.POOR
            report.warnings.append(
                "Contraste muy bajo. Asegúrate de que el texto resalte del fondo."
            )

        glare_mask = cv2.threshold(gray, 240, 255, cv2.THRESH_BINARY)[1]
        glare_pixel_ratio = float(np.sum(glare_mask > 0)) / gray.size
        if glare_pixel_ratio > 0.15:
            report.has_glare = True
            report.warnings.append(
                "Se detectó brillo excesivo en la imagen."
            )

        _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        report.text_density = float(np.sum(binary == 0)) / binary.size

        return report

    def _calculate_blur_score(self, gray: np.ndarray) -> float:
        return float(cv2.Laplacian(gray, cv2.CV_64F).var())

    def _detect_and_crop_document(self, img: np.ndarray) -> np.ndarray:
        h, w = img.shape[:2]
        ratio = h / 500.0
        dim = (int(w / ratio), 500)
        resized = cv2.resize(img, dim, interpolation=cv2.INTER_AREA)

        if len(resized.shape) == 3:
            gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
        else:
            gray = resized

        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        edged = cv2.Canny(blurred, 50, 150)

        contours, _ = cv2.findContours(edged, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            logger.debug("No contours found for document crop — skipping")
            return img

        largest = max(contours, key=cv2.contourArea)
        area = cv2.contourArea(largest)
        if area < (h * w * 0.05):
            logger.debug("Largest contour too small — skipping crop")
            return img

        peri = cv2.arcLength(largest, True)
        approx = cv2.approxPolyDP(largest, 0.02 * peri, True)

        if len(approx) == 4:
            pts = approx.reshape(4, 2).astype(np.float32)
            pts[:, 0] *= ratio
            pts[:, 1] *= ratio

            rect = self._order_points(pts)
            (tl, tr, br, bl) = rect
            width_a = np.linalg.norm(br - bl)
            width_b = np.linalg.norm(tr - tl)
            max_width = max(int(width_a), int(width_b))
            height_a = np.linalg.norm(tr - br)
            height_b = np.linalg.norm(tl - bl)
            max_height = max(int(height_a), int(height_b))

            dst = np.array([
                [0, 0],
                [max_width - 1, 0],
                [max_width - 1, max_height - 1],
                [0, max_height - 1],
            ], dtype=np.float32)

            M = cv2.getPerspectiveTransform(rect, dst)
            cropped = cv2.warpPerspective(img, M, (max_width, max_height))
            logger.info("Document contour detected — perspective corrected")
            return cropped

        logger.debug("Contour has %d points — not a quadrilateral, skipping warp", len(approx))
        return img

    def _order_points(self, pts: np.ndarray) -> np.ndarray:
        rect = np.zeros((4, 2), dtype=np.float32)
        s = pts.sum(axis=1)
        rect[0] = pts[np.argmin(s)]
        rect[2] = pts[np.argmax(s)]
        diff = np.diff(pts, axis=1)
        rect[1] = pts[np.argmin(diff)]
        rect[3] = pts[np.argmax(diff)]
        return rect

    def _deskew(self, img: np.ndarray) -> np.ndarray:
        if len(img.shape) == 3:
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        else:
            gray = img

        _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

        coords = cv2.findNonZero(binary)
        if coords is None or len(coords) < 100:
            logger.debug("Too few text pixels for deskew — skipping")
            return img

        angle = cv2.minAreaRect(coords)[-1]
        if angle < -45:
            angle = 90 + angle

        if abs(angle) < 0.5 or abs(angle) > 45:
            return img

        h, w = img.shape[:2]
        center = (w // 2, h // 2)
        M = cv2.getRotationMatrix2D(center, angle, 1.0)
        rotated = cv2.warpAffine(
            img, M, (w, h),
            flags=cv2.INTER_CUBIC,
            borderMode=cv2.BORDER_REPLICATE,
        )
        logger.info("Deskewed by %.2f degrees", angle)
        return rotated

    def _enhance_contrast(self, gray: np.ndarray) -> np.ndarray:
        clahe = cv2.createCLAHE(
            clipLimit=self.config.clahe_clip_limit,
            tileGridSize=(self.config.clahe_tile_size, self.config.clahe_tile_size),
        )
        return clahe.apply(gray)

    def _denoise(self, gray: np.ndarray) -> np.ndarray:
        return cv2.fastNlMeansDenoising(gray, h=self.config.denoise_h)

    def _adaptive_threshold(self, gray: np.ndarray) -> np.ndarray:
        bs = self.config.adaptive_block_size
        if bs % 2 == 0:
            bs += 1
        return cv2.adaptiveThreshold(
            gray, 255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY,
            bs,
            self.config.adaptive_c,
        )

    def _morphological_clean(self, binary: np.ndarray) -> np.ndarray:
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2))
        return cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)

    def _sharpen(self, gray: np.ndarray) -> np.ndarray:
        blurred = cv2.GaussianBlur(gray, (0, 0), 3.0)
        return cv2.addWeighted(
            gray, self.config.sharpen_strength,
            blurred, -0.5, 0,
        )

    def _resize_if_needed(self, img: np.ndarray) -> np.ndarray:
        h, w = img.shape[:2]
        if max(h, w) > self.config.max_image_dimension:
            scale = self.config.max_image_dimension / max(h, w)
            new_w = int(w * scale)
            new_h = int(h * scale)
            img = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_AREA)
            logger.info("Resized from %dx%d to %dx%d", w, h, new_w, new_h)
        elif min(h, w) < self.config.min_image_dimension:
            scale = self.config.min_image_dimension / min(h, w)
            new_w = int(w * scale)
            new_h = int(h * scale)
            img = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_CUBIC)
            logger.info("Upscaled from %dx%d to %dx%d", w, h, new_w, new_h)
        return img

    def preprocess(self, image_path: str) -> Tuple[np.ndarray, QualityReport]:
        img = cv2.imread(image_path)
        if img is None:
            raise ValueError(f"Could not load image: {image_path}")

        img = self._resize_if_needed(img)
        quality = self.analyze_quality(img)

        if self.config.auto_crop:
            img = self._detect_and_crop_document(img)

        if self.config.deskew:
            img = self._deskew(img)

        if len(img.shape) == 3:
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        else:
            gray = img

        if self.config.denoise:
            gray = self._denoise(gray)

        if self.config.clahe:
            gray = self._enhance_contrast(gray)

        if self.config.sharpen:
            gray = self._sharpen(gray)

        if self.config.adaptive_threshold:
            binary = self._adaptive_threshold(gray)
        else:
            binary = gray

        if self.config.morphological_clean:
            binary = self._morphological_clean(binary)

        return binary, quality

    def preprocess_pil(self, image_path: str) -> Tuple[Image.Image, QualityReport]:
        binary_np, quality = self.preprocess(image_path)
        pil_img = Image.fromarray(binary_np)
        return pil_img, quality

    def preprocess_for_ai(self, image_path: str) -> Tuple[Image.Image, QualityReport]:
        img = cv2.imread(image_path)
        if img is None:
            raise ValueError(f"Could not load image: {image_path}")

        img = self._resize_if_needed(img)
        quality = self.analyze_quality(img)

        if self.config.auto_crop:
            img = self._detect_and_crop_document(img)

        if self.config.deskew:
            img = self._deskew(img)

        if len(img.shape) == 3:
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        else:
            gray = img

        if self.config.denoise:
            gray = self._denoise(gray)

        if self.config.clahe:
            gray = self._enhance_contrast(gray)

        rgb = cv2.cvtColor(gray, cv2.COLOR_GRAY2RGB)
        pil_img = Image.fromarray(rgb)
        return pil_img, quality

    def preprocess_bytes(self, image_data: bytes) -> Tuple[Image.Image, QualityReport]:
        nparr = np.frombuffer(image_data, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Could not decode image from bytes")

        quality = self.analyze_quality(img)

        if self.config.auto_crop:
            img = self._detect_and_crop_document(img)

        if self.config.deskew:
            img = self._deskew(img)

        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        if self.config.denoise:
            gray = self._denoise(gray)

        if self.config.clahe:
            gray = self._enhance_contrast(gray)

        if self.config.adaptive_threshold:
            binary = self._adaptive_threshold(gray)
        else:
            binary = gray

        if self.config.morphological_clean:
            binary = self._morphological_clean(binary)

        pil_img = Image.fromarray(binary)
        return pil_img, quality


image_preprocessor = ImagePreprocessor()
