# LEE_FAMILY 인수인계 문서

이 문서는 현재 `2-sohee/lee_family` 작업물을 다른 개발 모델이나 개발자가 이어서 작업하기 위한 기준 문서입니다.

## 1. 현재 기준 상태

- 기준 브랜치: `2-sohee-integrate-account-management`
- 기준 커밋: `4f0b12efc3230e71de356c119e8a4d5966f0ae8f`
- 저장소: `https://github.com/2-sohee/lee_family`
- 현재 구현은 바닐라 HTML/CSS/JavaScript입니다.
- Vite는 Firebase Hosting에 올릴 `dist/` 결과물을 만들기 위한 빌드 도구로만 추가되어 있습니다.
- 현재 로컬 동작 데이터는 `localStorage`에 저장됩니다.
- Firebase 초기화·인증·Firestore 저장소 모듈과 Hosting workflow는 준비되어 있지만, 현재 UI의 모든 저장 흐름이 Firebase로 전환된 상태는 아닙니다.

## 2. 로컬 실행

### 브라우저로 정적 확인

의존성 없이 저장소 루트에서 다음 명령을 실행할 수 있습니다.

```powershell
python -m http.server 4180 --bind 127.0.0.1
```

브라우저에서 `http://127.0.0.1:4180/index.html`을 엽니다.

### Vite 개발 서버

Node.js와 npm이 설치된 환경에서는 다음을 사용합니다.

```powershell
npm install
npm run dev
```

### 빌드

```powershell
npm run build
```

현재 작업 환경에는 Node/npm이 없어 Vite 빌드와 JavaScript 런타임 문법 검사를 실행하지 못했습니다. 지금까지는 `git diff --check`와 정적 feature marker 검증을 사용했습니다.

## 3. 주요 파일

| 파일 | 역할 |
| --- | --- |
| `index.html` | 앱 쉘, 사이드바, 네비게이션, 상단 사용자 영역, `#app-view`, `#modal-root` |
| `app.js` | 상태, 화면 템플릿, 날짜 캘린더, 집안일/공지/냉장고 동작, 폼 저장 이벤트 |
| `styles.css` | 앱형 반응형 레이아웃, 계절 테마, 냉장고 모형, 캐릭터/집안일, 모달과 사진 미리보기 |
| `identity.js` | 현재 로그인 세션, 가족 설정, 데모 인증, 관리자/일반 사용자 구분, 프로필/관리자 화면 |
| `src/photoStorage.js` | 브라우저 이미지 파일 검증 및 Data URL 변환. 추후 Firebase Storage adapter로 교체할 경계 |
| `src/firebase.js` | `VITE_FIREBASE_*` 환경변수 기반 Firebase 초기화 |
| `src/auth.js` | Firebase Auth로 교체할 인증 seam |
| `src/familyRepository.js` | 가족·재료·일정·집안일·공지 Firestore repository seam |
| `src/bootstrap.js` | Firebase 설정이 있을 때 사용할 초기화 지점 |
| `firebase.json` | Firebase Hosting 설정 |
| `firestore.rules` | 인증 사용자 및 관리자 claim 기반 Firestore 보안 규칙 |
| `.github/workflows/firebase-hosting.yml` | `main` push 시 Vite build 및 Firebase Hosting 배포 workflow |
| `.env.example` | Firebase Web 설정 placeholder |
| `.firebaserc.example` | Firebase 프로젝트 alias placeholder |
| `ui-preview.html` | 초기 정적 UI 참고용 파일. 런타임 앱 진입점이 아님 |

## 4. 현재 기능

### 앱 UI

- 데스크톱 최대 폭과 카드 비율을 앱에 맞게 조정했습니다.
- 태블릿에서는 사이드바가 축소되고, 모바일에서는 하단 내비게이션 형태로 동작합니다.
- `100dvh`, `viewport-fit=cover`, safe-area padding을 사용합니다.
- 봄/여름/가을/겨울 월별 테마가 적용됩니다.
- 기본 표시 이름은 `SOHEE / 소희`입니다.

### 로그인과 역할

현재 데모 인증은 `identity.js`의 localStorage 기반 adapter입니다.

| 아이디 | 비밀번호 | 역할 |
| --- | --- | --- |
| `admin` | `admin` | 관리자 |
| `mom` | `1234` | 일반 사용자 |
| `dad` | `1234` | 일반 사용자 |
| `sibling` | `1234` | 일반 사용자 |

- 관리자 화면 표시명은 가족 구성원 이름이 아니라 `관리자`입니다.
- 기존 `suhui / 1234` 관리자 세션은 `authVersion` 검사로 무효화됩니다.
- Firebase Auth로 교체할 때 `authenticate()`와 세션 저장 부분을 `src/auth.js` 호출로 교체합니다.
- 실제 서비스에서는 비밀번호를 localStorage에 평문으로 저장하면 안 됩니다.

### 냉장고

- 냉장실·냉동실·실온을 구분하는 냉장고 모형을 표시합니다.
- 재료는 보관 위치별 칸에 렌더링됩니다.
- 재료명, 수량, 보관 위치, 유통기한을 추가할 수 있습니다.
- 유통기한이 지나면 빨간색 경고로 표시됩니다.
- 새 재료 추가 후 냉장고/목록에 도착 애니메이션이 표시됩니다.
- 사진은 최대 4장을 선택하고 미리보기·삭제할 수 있습니다.
- 현재 사진은 브라우저 Data URL로 localStorage에 저장됩니다.
- 실제 AI 재료 인식은 아직 연결되지 않았습니다. 후보 모델로 Gemini 2.5 Flash가 논의되었으며, 반드시 사용자 확인 후 DB에 저장하는 서버 측 흐름이 필요합니다.

### 추천 메뉴

냉장고 탭의 추천 메뉴 버튼은 다음 카테고리로 동작합니다.

- 한식
- 중식
- 양식
- 일식
- 간편식

선택된 카테고리에 따라 메뉴와 현재 재료 매칭 설명이 바뀝니다.

### 가족 일정

- 가족 일정 탭은 현재 월의 월간 캘린더를 표시합니다.
- 월요일 시작입니다.
- 인접 월 날짜도 그리드에 포함됩니다.
- 현재 주와 오늘 날짜가 강조됩니다.
- 구성원별 일정 색상이 다릅니다.
- Dashboard에는 압축된 주간 미리보기가 표시됩니다.

### 집안일 TO-DO LIST

- 수희/소희, 엄마, 아빠, 동생별 그룹 목록을 표시합니다.
- 담당자 캐릭터/아바타와 각자의 집안일을 표시합니다.
- 관리자(`admin`)는 모든 가족의 집안일을 체크·삭제할 수 있습니다.
- 일반 사용자는 본인 집안일만 체크·삭제할 수 있습니다.
- 다른 사용자의 집안일은 일반 사용자에게 읽기 전용이며 조작 버튼이 없습니다.
- 완료 상태는 localStorage에 저장됩니다.
- 완료 항목은 색상, 취소선, 연한 텍스트로 표시됩니다.
- 완료 상태의 `V`/체크 글리프는 CSS에서 강제로 숨깁니다.
- 집안일은 담당자, 기한, 주기를 함께 저장합니다.

### 공지사항

- 공지 작성, 열람, 삭제가 가능합니다.
- 중요 공지는 노란색으로 강조됩니다.
- 비밀번호 보호 공지는 열람 시 비밀번호를 요구합니다.
- 10개 단위 페이징 구조가 있습니다.

### 가족 브랜드

- 가족명, 로고 텍스트/이모지, 로고 이미지, 테마 색상을 설정할 수 있는 데이터 구조가 있습니다.
- 브랜드 설정은 `lee-family-settings`에 저장됩니다.
- 현재 통합된 `identity.js` 기준으로 LF 브랜드 편집 진입은 관리자 중심 흐름입니다. “모든 로그인 사용자가 LF를 편집”해야 한다면 `brand.onclick`/`brandEditor` 권한 조건을 일반 로그인 상태로 완화해야 합니다.

### 마이페이지

- 일반 사용자와 관리자 모두 내 프로필 화면을 볼 수 있습니다.
- 한국어 표시 이름, 영문 표시 이름, 아바타 글자, 프로필 사진, 개인 색상을 수정할 수 있습니다.
- 수정 결과는 인사말, 상단 프로필, 가족 카드에 반영됩니다.
- 비밀번호 변경 UI는 Firebase Auth 연결 예정 placeholder입니다.

### 관리자 페이지

- `admin/admin` 로그인 시 관리자 관리 메뉴가 노출됩니다.
- 가족명, 로고 글자, 테마 색상, 구성원 이름, 영문 이름, 아이디, 비밀번호, 역할, 아바타, 사진 URL, 색상, 활성 상태를 관리할 수 있습니다.
- 구성원 추가/삭제가 가능합니다.
- 활성 관리자가 최소 한 명 이상이어야 저장됩니다.
- 일반 사용자는 관리자 메뉴와 관리자 핸들러에 접근할 수 없습니다.

## 5. localStorage 계약

| 키 | 내용 |
| --- | --- |
| `lee-family-state` | `ingredients`, `events`, `chores`, `notices`, `fridgePhotos` |
| `lee-family-auth` | 현재 로그인 세션. `memberId`, `authVersion` |
| `lee-family-settings` | 가족명, 로고, 테마 색상, 구성원 목록, 역할, 인증 데모 값 |

기존 데이터와 호환해야 하므로 새 필드는 기본값/legacy fallback을 제공해야 합니다. 사용자 입력은 HTML 렌더링 전에 `esc()`로 이스케이프합니다.

## 6. Firebase 전환 계획

1. Firebase Console에서 프로젝트와 Web App을 생성합니다.
2. Authentication provider와 Firestore를 활성화합니다.
3. `.env.example`을 `.env.local`로 복사하고 `VITE_FIREBASE_*` 값을 입력합니다.
4. `src/firebase.js` 초기화를 연결합니다.
5. `src/auth.js`의 인증 adapter를 Firebase Auth로 교체합니다.
6. `src/familyRepository.js`를 현재 `save()`/localStorage 호출과 연결합니다.
7. 이미지 업로드는 `src/photoStorage.js`의 local Data URL adapter를 Firebase Storage adapter로 교체합니다.
8. `familyMembers/{uid}` 문서와 관리자 custom claim을 구성합니다.
9. `firestore.rules`를 배포하고 규칙 테스트를 추가합니다.

서비스 계정 JSON과 Firebase 비밀값은 절대 저장소에 커밋하지 않습니다.

## 7. GitHub/Firebase 배포

GitHub Actions가 `main` push 시 다음 Secrets를 필요로 합니다.

- `FIREBASE_PROJECT_ID`
- `FIREBASE_SERVICE_ACCOUNT`
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

`.firebaserc.example`을 `.firebaserc`로 복사해 실제 프로젝트 alias를 지정합니다. `.firebaserc`와 `.env*` 실제 값은 `.gitignore`에 의해 제외되어야 합니다.

## 8. 알려진 제한과 다음 작업

- 현재 인증과 데이터 저장은 localStorage 데모입니다. 다중 사용자 실시간 동기화는 Firebase 연결이 필요합니다.
- 실제 비밀번호 해싱/변경은 Firebase Auth로 이전해야 합니다.
- 냉장고 사진은 로컬 Data URL이며, Firebase Storage 연결이 필요합니다.
- AI 사진 재료 인식은 아직 구현되지 않았습니다. 서버 측 Gemini/Vertex 호출, 비용 제한, 사용자 확인 단계, JSON schema 검증이 필요합니다.
- 현재 `index.html`의 정적 진입 방식과 Vite build 방식이 함께 있습니다. Firebase Hosting 배포 전 실제 `dist/` 결과와 `firebase.json` rewrite를 확인해야 합니다.
- Node/npm이 없는 환경에서는 `npm install`, `npm run build`, JS syntax check를 실행하지 못했습니다. Node/npm 설치 후 반드시 실행합니다.
- 기능 추가 시 `app.js` 한 파일에 로직이 집중되어 있으므로, 인증·상태·렌더링·폼 처리를 모듈로 분리하는 것이 다음 리팩터링 우선순위입니다.

## 9. 인수인계 체크리스트

- [ ] `npm install`
- [ ] `npm run build`
- [ ] `npm run dev`에서 로그인/로그아웃 확인
- [ ] `admin/admin`으로 관리자 메뉴와 `관리자` 표시 확인
- [ ] 일반 계정으로 마이페이지와 타인 집안일 읽기 전용 확인
- [ ] 관리자/일반 사용자 집안일 완료·삭제 권한 확인
- [ ] 완료 집안일에 `V`가 표시되지 않는지 확인
- [ ] 프로필 사진 1장, 냉장고 사진 4장 제한 확인
- [ ] 냉장고 추천 카테고리별 결과 확인
- [ ] 일정 월간 캘린더와 현재 주 강조 확인
- [ ] 중요 공지 노란색, 비밀번호 공지, 페이징 확인
- [ ] Firebase 환경변수와 GitHub Secrets 설정
- [ ] Firestore rules emulator/CI 테스트 추가

