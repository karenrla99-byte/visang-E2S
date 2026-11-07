// 정적 이미지 경로 도우미. 단독 실행 HTML 빌드는 window.__ASSETS__ 에 {경로: data URI}를 넣어 주고, 서버 실행에서는 경로 그대로 쓴다.
export const asset = (path) => (typeof window !== 'undefined' && window.__ASSETS__ && window.__ASSETS__[path]) || path;
