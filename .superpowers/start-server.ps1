$session_dir = "C:\Users\gunze\Documents\antigravity\focused-hypatia\.superpowers\brainstorm\session-1"
if (-not (Test-Path "$session_dir\content")) {
    New-Item -ItemType Directory -Force -Path "$session_dir\content"
}
if (-not (Test-Path "$session_dir\state")) {
    New-Item -ItemType Directory -Force -Path "$session_dir\state"
}
$env:BRAINSTORM_DIR = $session_dir
$env:BRAINSTORM_HOST = "127.0.0.1"
$env:BRAINSTORM_URL_HOST = "localhost"
$env:BRAINSTORM_OWNER_PID = $PID
node "C:\Users\gunze\.gemini\config\skills\brainstorming\scripts\server.cjs"
