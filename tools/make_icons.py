# python tools/make_icons.py — 대한사료 CI(흰색)를 녹색 정사각 아이콘으로 (PWA/홈 화면용)
from PIL import Image
logo = Image.open('ci_white.png').convert('RGBA')
for size in (192, 512):
    bg = Image.new('RGBA', (size, size), (0, 0x62, 0x41, 255))
    w = int(size * 0.72)  # maskable 안전영역(80%) 안에 들어가도록
    lg = logo.resize((w, round(logo.height * w / logo.width)), Image.LANCZOS)
    bg.alpha_composite(lg, ((size - lg.width) // 2, (size - lg.height) // 2))
    bg.convert('RGB').save(f'icon-{size}.png', optimize=True)
