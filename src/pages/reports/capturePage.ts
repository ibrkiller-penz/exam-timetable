/**
 * 인쇄물 한 장을 그림으로 뜹니다. 인쇄와 PDF 저장이 모두 이 한 곳을 씁니다.
 *
 * 왜 html2canvas 를 버렸나.
 *   html2canvas 는 화면을 흉내 내어 캔버스에 글자를 '다시' 그립니다. 그런데
 *   글자의 세로 위치를 브라우저와 다르게 잡아서, 글자가 아래로 몇 픽셀씩
 *   밀립니다. 봉투 라벨의 제목이 밑줄에 걸치고, 아래 칸의 `3-4`, `22명` 이
 *   반쯤 잘려 나왔습니다. 화면에서는 멀쩡하니 종이를 보기 전에는 모릅니다.
 *   칸마다 여백을 덧대어 가리던 것도 한계가 있었습니다.
 *
 * 지금 방식.
 *   modern-screenshot 은 화면 조각을 SVG 안에 그대로 넣고(foreignObject),
 *   그 SVG 를 브라우저가 직접 그리게 합니다. 글자를 그리는 것이 화면과 같은
 *   브라우저 엔진이므로 화면과 종이가 어긋날 수 없습니다. 같은 장을 두 방식으로
 *   떠서 견주어 보고 정했습니다. 더 빠르기도 합니다.
 *
 * 글꼴.
 *   이 방식은 글꼴 파일을 읽어 그림 안에 함께 넣어야 합니다. 인터넷 판은 같은
 *   주소에서 읽으면 되지만, 오프라인 실행 파일은 file:// 로 열려 글꼴 파일을
 *   읽을 수 없습니다(fetch 가 file:// 을 막습니다). 그래서 오프라인 빌드에서는
 *   글꼴을 CSS 안에 바로 박아 넣습니다(vite.config.ts 참고). 그러면 읽으러
 *   갈 일이 없습니다.
 *
 * 무거운 라이브러리는 누르는 그 순간에 불러옵니다.
 */

export async function capturePage(el: HTMLElement, scale: number): Promise<HTMLCanvasElement> {
  const { domToCanvas } = await import('modern-screenshot');
  return domToCanvas(el, {
    scale,
    backgroundColor: '#ffffff',
    // 글꼴·그림을 읽다 멈추면 인쇄 전체가 멈춥니다. 넉넉히 기다리되 끝은 둡니다.
    timeout: 30000,
  });
}
