import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

/*
 * 오프라인 배포판인가.
 *
 * USB로 돌리는 판과 공모전 제출본은 인터넷 없이 씁니다. 그런 빌드에서는
 * 클라우드 코드를 아예 빼서, 파이어베이스 라이브러리와 접속 설정값(키·프로젝트
 * 이름)이 실행 파일 안에 실려 다니지 않게 합니다. 화면에서 클라우드 단추는
 * 원래도 보이지 않았지만, 파일을 열어 보면 값이 보였습니다.
 *
 * 켜는 법: 환경변수 OFFLINE=1 (scripts/build-offline.cjs 가 켭니다)
 */
const OFFLINE = process.env.OFFLINE === '1';

/**
 * 클라우드 모듈을 빈 껍데기로 바꿔 끼웁니다.
 *
 * 별칭(alias)은 적어 낸 글자(`../domain/firebase`)와 견주는 방식이라
 * 부르는 곳마다 글자가 달라 놓치기 쉽습니다. 여기서는 먼저 실제 경로까지
 * 풀어 본 뒤 그 파일이면 바꿔 끼우므로, 어디서 어떻게 부르든 걸립니다.
 */
const 클라우드빼기 = {
  name: 'offline-cloud-stub',
  enforce: 'pre' as const,
  async resolveId(this: any, source: string, importer: string | undefined, options: any) {
    const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
    if (!resolved) return null;
    // 윈도의 역슬래시를 슬래시로 고쳐 한 가지 모양으로만 견줍니다.
    const asPosix = resolved.id.split(path.sep).join('/');
    if (asPosix.endsWith('/src/domain/firebase.ts')) {
      return path.resolve(__dirname, 'src/domain/firebase.offline.ts');
    }
    return null;
  },
};

export default defineConfig({
  plugins: [react(), ...(OFFLINE ? [클라우드빼기] : [])],
  base: './',
  define: {
    // 화면 코드에서 이 값으로 갈라 두면, 오프라인 빌드에서는 그 가지가
    // 통째로 지워집니다. 문자열(내려받기 주소 등)도 같이 사라집니다.
    __OFFLINE__: JSON.stringify(OFFLINE),
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1500,
    /*
     * 오프라인 빌드에서는 글꼴을 CSS 안에 바로 박아 넣습니다.
     *
     * 인쇄·PDF 는 화면 조각을 그림으로 뜨는데, 그때 글꼴 파일을 읽어 그림
     * 안에 함께 넣어야 합니다(capturePage.ts). 실행 파일은 file:// 로 열려
     * 글꼴 파일을 읽을 수 없으므로, 처음부터 CSS 안에 들어 있게 합니다.
     * 인터넷 판은 파일로 두어 첫 화면이 가볍게 뜨게 합니다.
     */
    assetsInlineLimit: OFFLINE
      ? (file: string) => (file.endsWith('.woff2') ? true : undefined)
      : 4096,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          lucide: ['lucide-react'],
          // NEIS 파일을 읽는 xlsx는 1단계에서 쓰고,
          // 엑셀을 쓰는 exceljs는 버튼을 누를 때 따로 불러옵니다.
          excel: ['xlsx'],
          // 오프라인 빌드에는 파이어베이스가 들어가지 않으므로 묶을 것도 없습니다.
          ...(OFFLINE ? {} : { firebase: ['firebase/app', 'firebase/firestore'] }),
        },
      },
    },
  },
});
