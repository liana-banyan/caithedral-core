# Shell Overlay Roadmap — CAI™ Core

**Status: v0.1.8 delivers in-app Substrated™ indicator + folder tracking. v0.1.9 targets native COM DLL.**

## What this document covers

Windows Explorer shell icon overlays — the green checkmarks Dropbox and OneDrive use
to show sync status on files and folders in Explorer. CAI™ Core v0.1.8 ships the
in-application visual indicator for Substrated folders and defers the shell-level
overlay to v0.1.9, which requires a native C++ addon.

---

## Technical Background — IShellIconOverlayIdentifier

Windows shell icon overlays use the `IShellIconOverlayIdentifier` COM interface
(`shlobj.h`). The shell polls registered overlay handlers and applies the first
matching overlay icon.

### COM registration path

```registry
HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\ShellIconOverlayIdentifiers\
  └─ " CAI Core Substrated"   ← Leading space = high sort priority (Dropbox pattern)
       └─ (Default) = "{CLSID-GUID}"

HKEY_CLASSES_ROOT\CLSID\{CLSID-GUID}\
  ├─ (Default) = "CAI Core Shell Overlay"
  └─ InprocServer32\
       ├─ (Default) = "C:\Program Files\CAI Core\shell_overlay.dll"
       └─ ThreadingModel = "Apartment"
```

**CLSID to reserve:** `{A4B8F3C2-1D9E-4E7A-B8C5-2F3A6D8E9B1C}` (placeholder; generate fresh GUID for production)

### DLL exports required

The DLL must export:
- `DllRegisterServer` / `DllUnregisterServer` — COM registration
- `DllGetClassObject` — factory for `IShellIconOverlayIdentifier`

### `IShellIconOverlayIdentifier` interface

```cpp
STDMETHODIMP IsMemberOf(LPCWSTR pwszPath, DWORD dwAttrib);
// Returns S_OK if file/folder at pwszPath should show the overlay.
// CAI™ Core check: does pwszPath fall under a Substrated folder?
// Read ~/.cai_core/substrated_folders.json (shared with main process).

STDMETHODIMP GetOverlayInfo(LPWSTR pwszIconFile, int cchMax, int *pIndex, DWORD *pdwFlags);
// Returns path to icon + index. Use the CAI™ green-checkmark PNG exported to
// C:\Program Files\CAI Core\resources\overlay_check.ico

STDMETHODIMP GetPriority(int *pPriority);
// Return 0 (highest priority).
```

### Implementation approach for v0.1.9

1. **Scaffold Node.js native addon** (`native/shell_overlay/`)
   - Use `node-addon-api` (N-API) for ABI stability across Electron versions
   - The DLL is a separate Win32 process-side COM server, NOT loaded into the Electron process
   - Build with `cmake-js` or `node-gyp`

2. **NSIS installer integration** (`assets/installer.nsh`)
   - `ExecWait 'regsvr32 /s "$INSTDIR\shell_overlay.dll"'` on install
   - `ExecWait 'regsvr32 /u /s "$INSTDIR\shell_overlay.dll"'` on uninstall
   - Kill Explorer to refresh overlay cache: `taskkill /f /im explorer.exe` then restart

3. **Substrated check logic in DLL**
   - `IsMemberOf` reads `%USERPROFILE%\.cai_core\substrated_folders.json` (same path main process uses)
   - Uses `PathIsPrefix` to check if `pwszPath` starts with any Substrated path
   - File handle opened read-only with share-all; result cached 5s to avoid Explorer slowdown

4. **Icon asset**
   - Export `assets/overlay_check_green.ico` (16×16 · 32×32 · 48×48 multi-size ICO)
   - Green checkmark matching CAI™ brand palette (#22c55e)

5. **Windows version support**
   - Windows 10 1909+ (overlay slots limited to 15 total system-wide; leading-space trick maximizes priority)
   - Windows 11 compatible

### Overlay slot limit caveat

Windows allows only 15 `ShellIconOverlayIdentifiers` entries system-wide. Dropbox,
OneDrive, and others compete for slots. Leading-space in the registry key name sorts
first alphabetically. If all 15 slots are consumed by other apps, the overlay will not
display — this is a Windows limitation, not a CAI™ Core bug.

---

## v0.1.8 In-App Indicator (shipped)

CAI™ Core v0.1.8 ships a visual indicator within the app:

- Substrated folders show a **✓ Substrated** badge in the Substrated Folders panel
- The badge color matches the planned shell overlay icon (#22c55e green)
- The `SubstratedFoldersManager` class writes Eblet™ records and maintains a manifest
  that the future COM DLL will consume via `substrated_folders.json`

---

## Reference implementations

- Dropbox shell overlay: [shellfolders.cpp pattern via open-source community analysis]
- Microsoft OneDrive: uses `StorageProviderSyncRootManager` (newer API; requires storage provider registration)
- TortoiseSVN/TortoiseGit: classic `IShellIconOverlayIdentifier` pattern, open-source C++ DLL reference

---

*KniPr006 · CAI™ Core v0.1.8 · Liana Banyan Corporation · SSPL-1.0*
