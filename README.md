# 영어회화 100일의 기적 — 차량용 쉐도잉 앱

『영어회화 100일의 기적』(문성현·넥서스) 음원을 차에서 "듣고 → 따라 말하고 → 외우는" 개인용 PWA.

## 폴더
- `docs/` — 앱 본체 (GitHub Pages로 배포되는 껍데기. 음원·문장 없음)
- `raw/` — 넥서스에서 받은 원본 음원·PDF (git 제외)
- `tools/` — 음원 분석·팩 생성 스크립트 (Node)
- `dist/` — 생성된 `pack.zip`, `days.json` (git 제외)

## 자료 팩 다시 만들기
```
cd tools
node stt_all.mjs      # 음성인식 → out/stt/*.json (최초 1회, ~30분)
node lt_parse.mjs     # 리스닝 PDF → out/lt.json (복습 300문장, 한국어 뜻)
node tts_all.mjs      # 한국어 TTS → out/ko/*.mp3
node build_pack.mjs   # → ../dist/pack.zip, days.json
```
`dist/pack.zip`을 폰에 복사 → 앱 📦 → "pack.zip 불러오기".

## 로컬 테스트
```
node tools/serve.mjs   # http://localhost:8080
```

## 앱 동작 원리
- 음원·문장은 IndexedDB에 저장 (오프라인)
- 모드 선택 시 OfflineAudioContext로 "문장 → 쉼 → 문장…" 트랙을 WAV로 렌더링해 `<audio>`로 통째 재생 → 화면 꺼도 계속, 블루투스 ⏮⏭ = 문장 이동
- 진도·설정은 localStorage
