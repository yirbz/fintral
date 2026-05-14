import numpy as np
import cv2
from PIL import Image

from app.services.pipeline.image_preprocessor import (
    ImagePreprocessor,
    PreprocessConfig,
    OcrReadiness,
    image_preprocessor,
)


class TestImagePreprocessor:

    def _create_test_image(self, width=800, height=600, text_color=0, bg_color=255):
        arr = np.full((height, width), bg_color, dtype=np.uint8)
        cv2.putText(arr, "RNC 123-456789-0 NCF B0100000123", (50, 100),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, text_color, 2)
        cv2.putText(arr, "TOTAL RD$ 1,500.00", (50, 200),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, text_color, 2)
        cv2.putText(arr, "ITBIS 18%: RD$ 270.00", (50, 300),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, text_color, 2)
        cv2.putText(arr, "FECHA: 15/01/2026", (50, 400),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, text_color, 2)
        return arr

    def test_preprocess_returns_pil_and_quality(self, tmp_path):
        img_path = tmp_path / "test.png"
        arr = self._create_test_image()
        cv2.imwrite(str(img_path), arr)

        pil_img, quality = image_preprocessor.preprocess_pil(str(img_path))

        assert isinstance(pil_img, Image.Image)
        assert quality.blur_score > 0
        assert 0 <= quality.brightness <= 255

    def test_quality_report_good_image(self, tmp_path):
        img_path = tmp_path / "good.png"
        arr = self._create_test_image(bg_color=220)
        cv2.imwrite(str(img_path), arr)

        _, quality = image_preprocessor.preprocess_pil(str(img_path))

        assert quality.ocr_readiness in (OcrReadiness.GOOD, OcrReadiness.FAIR)
        assert not quality.is_too_dark
        assert not quality.is_too_bright

    def test_quality_detects_dark_image(self, tmp_path):
        img_path = tmp_path / "dark.png"
        arr = self._create_test_image(text_color=15, bg_color=25)
        cv2.imwrite(str(img_path), arr)

        _, quality = image_preprocessor.preprocess_pil(str(img_path))

        assert quality.is_too_dark or quality.contrast < 30
        assert quality.ocr_readiness == OcrReadiness.POOR
        assert len(quality.warnings) > 0

    def test_quality_detects_glare(self, tmp_path):
        img_path = tmp_path / "glare.png"
        arr = np.full((600, 800), 180, dtype=np.uint8)
        cv2.rectangle(arr, (100, 100), (700, 500), 252, -1)
        cv2.putText(arr, "RNC 123-456789-0", (50, 550),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, 0, 2)
        cv2.imwrite(str(img_path), arr)

        _, quality = image_preprocessor.preprocess_pil(str(img_path))

        assert quality.has_glare or quality.ocr_readiness in (OcrReadiness.FAIR, OcrReadiness.POOR)

    def test_quality_detects_blur(self, tmp_path):
        img_path = tmp_path / "blur.png"
        arr = self._create_test_image()
        blurred = cv2.GaussianBlur(arr, (15, 15), 5)
        cv2.imwrite(str(img_path), blurred)

        _, quality = image_preprocessor.preprocess_pil(str(img_path))

        assert quality.blur_score < 200

    def test_preprocess_bytes(self):
        arr = self._create_test_image()
        success, encoded = cv2.imencode(".png", arr)
        assert success
        img_bytes = encoded.tobytes()

        pil_img, quality = image_preprocessor.preprocess_bytes(img_bytes)

        assert isinstance(pil_img, Image.Image)
        assert pil_img.mode == "L"

    def test_preprocess_config_disabled_steps(self, tmp_path):
        config = PreprocessConfig(
            auto_crop=False,
            deskew=False,
            denoise=False,
            clahe=False,
            adaptive_threshold=False,
            morphological_clean=False,
        )
        preprocessor = ImagePreprocessor(config=config)

        img_path = tmp_path / "minimal.png"
        arr = self._create_test_image()
        cv2.imwrite(str(img_path), arr)

        binary, quality = preprocessor.preprocess(str(img_path))

        assert isinstance(binary, np.ndarray)
        assert quality.ocr_readiness is not None

    def test_deskew_corrects_rotation(self, tmp_path):
        img_path = tmp_path / "skewed.png"
        arr = self._create_test_image()
        h, w = arr.shape[:2]
        center = (w // 2, h // 2)
        M = cv2.getRotationMatrix2D(center, 5.0, 1.0)
        skewed = cv2.warpAffine(arr, M, (w, h), borderMode=cv2.BORDER_CONSTANT,
                                 borderValue=255)
        cv2.imwrite(str(img_path), skewed)

        config = PreprocessConfig(auto_crop=False, deskew=True, clahe=False,
                                  adaptive_threshold=False, morphological_clean=False,
                                  denoise=False)
        preprocessor = ImagePreprocessor(config=config)
        corrected, quality = preprocessor.preprocess(str(img_path))

        assert abs(quality.skew_angle) < 0.5 or quality.skew_angle == 0.0

    def test_blur_score_variance(self, tmp_path):
        sharp_path = tmp_path / "sharp.png"
        arr = self._create_test_image()
        cv2.imwrite(str(sharp_path), arr)

        blur_path = tmp_path / "blur.png"
        blurred = cv2.GaussianBlur(arr, (21, 21), 7)
        cv2.imwrite(str(blur_path), blurred)

        _, sharp_q = image_preprocessor.preprocess_pil(str(sharp_path))
        _, blur_q = image_preprocessor.preprocess_pil(str(blur_path))

        assert sharp_q.blur_score > blur_q.blur_score

    def test_ocr_readiness_enum_values(self):
        assert OcrReadiness.GOOD.value == "good"
        assert OcrReadiness.FAIR.value == "fair"
        assert OcrReadiness.POOR.value == "poor"
        assert OcrReadiness.UNUSABLE.value == "unusable"
