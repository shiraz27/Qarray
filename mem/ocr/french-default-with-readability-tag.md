---
name: French-default OCR with readability tag
description: OCR defaults to French (fra+ara+eng), auto-switches to ara+fra+eng or eng+fra+ara on majority script. Each row gets an ocr_readability tag (high/medium/low/unreadable) computed by src/utils/ocrReadability.ts. Filter + badge surfaced in Statistics. Tesseract tuned with preserve_interword_spaces=1, dpi=300, psm=6 (retry psm=3 on sparse pages). Small images upscaled 2x, small PDF pages rendered at scale 3.
type: feature
---
OCR pipeline (`src/utils/pdfOcrHelpers.ts` + both client processors) probes page 1 with `fra+ara+eng`, then picks final pack via `detectOcrLanguage`. Default is French (Tunisian scientific subjects). Header `[OCR mode: X | langs: Y | detected: Z]` written to ocr_text. Description AI in `extract-metadata` also defaults to French for scientific subjects (uses existing MetaCell "AI suggest" button on description column). DB column `ocr_readability` added to resources and questions.