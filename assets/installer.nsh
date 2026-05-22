; CAI™ Core — NSIS custom installer script
; BP051 NOVACULA · SEG-CC-6 · Designed to Be Copied
; Distribution: ONLY from https://mnemosynec.ai/download/ — no USB redistribution

; Kill any running CAI Core process before installing
!macro customInstall
  DetailPrint "Installing CAI™ Core ${VERSION} — SSPL-1.0 + Cooperative Patent Pledge #2260"
  nsExec::Exec 'taskkill /F /IM "CAI Core.exe" /T'
  DetailPrint "Canonical download URL: https://mnemosynec.ai/download/"
  DetailPrint "CAI™ Core ${VERSION} install ready — Designed to Be Copied"
!macroend

; On uninstall, leave user data intact (substrate cache, telemetry)
; Data lives in %APPDATA%\CAI Core — not removed (user data sovereignty)
!macro customUnInstall
  DetailPrint "CAI™ Core ${VERSION} uninstall: user data preserved"
  ; Intentionally leave %APPDATA%\CAI Core substrate cache + telemetry
  DetailPrint "Substrate data preserved at $APPDATA\CAI Core"
  DetailPrint "Re-download from: https://mnemosynec.ai/download/"
!macroend
