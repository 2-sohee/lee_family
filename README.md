# LEE_FAMILY

가족용 웹앱(바닐라 HTML/CSS/JS)입니다. Vite로 빌드하고 **Firebase Hosting**에 배포하며, 로그인은 **Firebase Authentication**, 데이터는 **Cloud Firestore**를 사용합니다. `main` 브랜치에 push하면 GitHub Actions가 테스트 → 빌드 → 배포를 자동으로 실행합니다.

## 구조

| 구성 | 역할 |
| --- | --- |
| Firebase Authentication (이메일/비밀번호) | 로그인. 사용자는 `mom` 같은 아이디로 로그인하고, 내부적으로 `mom@lee-family.example.com` 이메일 계정을 사용합니다. |
| Cloud Firestore | `families/{familyId}` 문서(가족 정보, 접근 목록), `members`, `state`(재료·일정·집안일·공지), `fridgePhotos` |
| Firebase Hosting | `dist/` 정적 배포 |
| GitHub Actions | `.github/workflows/firebase-deploy.yml` — 규칙 테스트, 빌드, Hosting + Firestore 규칙 배포 |

사진은 브라우저에서 축소·압축해 Firestore에 저장하므로 무료(Spark) 플랜에서 동작합니다.

## 계정 관리

- **시스템 관리자(고정)**: 아이디 `admin` / 비밀번호 `admin!`, 이름 `관리자`. 가족 구성원이 아니므로 가족 일정·집안일 담당자·가족 카드에 표시되지 않고 내 프로필도 없습니다. 관리자 계정과 가족 공간은 서버(firebase-admin)에서만 만들 수 있으며 앱에서 추가 관리자를 만들 수 없습니다.
- **가족 계정 생성**: 관리자로 로그인 → `설정` → “가족 계정 만들기”에서 표시 이름, 아이디, 초기 비밀번호를 입력합니다. 만든 계정은 모두 가족 구성원(user)입니다.
- **설정 페이지**: 가족 공간 이름·로고·테마 색상, 가족 계정 생성, 구성원 정보 수정·활성 해제·삭제를 한 곳에서 관리합니다.
- **비밀번호 변경**: 각 사용자가 `내 프로필`에서 직접 변경합니다.
- **비밀번호 분실**: Firebase Console → Authentication에서 해당 사용자를 삭제한 뒤, `설정`에서 같은 아이디로 다시 만들면 프로필을 유지한 채 새 비밀번호가 설정됩니다.
- **접근 차단**: `설정`에서 “활성 구성원”을 해제하거나 구성원을 삭제하면 즉시 접근이 차단됩니다.

접근 권한은 `firestore.rules`가 `families/{familyId}`의 `memberEmails`/`adminEmails` 목록으로 강제합니다. 로그인 계정이 있어도 목록에 없으면 데이터를 읽거나 쓸 수 없습니다.

## AI 냉장고 재료 인식

냉장고 탭에서 사진을 올리면 Firebase AI Logic(Gemini Developer API, `src/ingredientRecognizer.js`)이 재료를 인식하고, 확인 창에서 추가할 재료를 고르고 이름·수량·보관 위치·유통기한을 고친 뒤 추가합니다. 이미 있는 재료(예: 달걀=계란)는 기본으로 선택 해제됩니다.

사용하려면 Firebase Console → **AI Logic** → **시작하기** → **Gemini Developer API**를 한 번 활성화해야 합니다(Spark 무료 플랜 가능). 활성화 전에는 사진 저장은 되고 인식 시 안내 메시지가 표시됩니다. Gemini 서버가 일시적으로 혼잡하면(500 "high demand") 다른 Gemini 모델로 자동 재시도합니다.

추천 메뉴는 현재 냉장고 재료(유통기한이 지난 재료 제외)와 레시피 DB(`recipeBook`)를 동의어까지 맞춰 비교해, 보유 재료가 하나 이상인 메뉴만 보유 비율 순으로 보여줍니다. 냉장고가 비어 있으면 추천하지 않습니다.

## Firebase 프로젝트 준비 (최초 1회)

1. [Firebase Console](https://console.firebase.google.com)에서 프로젝트를 만듭니다.
2. **Authentication → 시작하기 → 로그인 방법 → 이메일/비밀번호** 사용 설정.
3. **Firestore Database → 데이터베이스 만들기** (프로덕션 모드, 위치 예: `asia-northeast3` 서울).
4. **프로젝트 설정 → 일반 → 내 앱 → 웹(</>)**으로 웹 앱을 등록하고 `firebaseConfig` 값을 확인합니다.
5. **프로젝트 설정 → 서비스 계정 → 새 비공개 키 생성**으로 배포용 JSON 키를 받습니다. 이 파일은 절대 커밋하지 않습니다.

## GitHub Secrets

**Settings → Secrets and variables → Actions**에 등록합니다.

| Secret | 값 |
| --- | --- |
| `FIREBASE_PROJECT_ID` | Firebase 프로젝트 ID |
| `FIREBASE_SERVICE_ACCOUNT` | 서비스 계정 JSON 전체 |
| `VITE_FIREBASE_API_KEY` | 웹 앱 `apiKey` |
| `VITE_FIREBASE_AUTH_DOMAIN` | 웹 앱 `authDomain` |
| `VITE_FIREBASE_PROJECT_ID` | 웹 앱 `projectId` |
| `VITE_FIREBASE_STORAGE_BUCKET` | 웹 앱 `storageBucket` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | 웹 앱 `messagingSenderId` |
| `VITE_FIREBASE_APP_ID` | 웹 앱 `appId` |

등록 후 `main`에 push하거나 Actions 탭에서 워크플로를 수동 실행하면 `https://<프로젝트ID>.web.app`에 배포됩니다.

## 로컬 개발

Node.js 22+와 Java 11+(Firestore 에뮬레이터)가 필요합니다.

```powershell
npm ci
npm test            # Firestore 보안 규칙 테스트 (에뮬레이터)
```

에뮬레이터로 앱 실행:

```powershell
# .env.development.local
# VITE_FIREBASE_API_KEY=demo-key
# VITE_FIREBASE_AUTH_DOMAIN=demo-lee-family.firebaseapp.com
# VITE_FIREBASE_PROJECT_ID=demo-lee-family
# VITE_FIREBASE_APP_ID=1:0:web:demo
# VITE_FIREBASE_EMULATOR_HOST=127.0.0.1
npm run emulators   # 터미널 1
npm run dev         # 터미널 2
```

실제 프로젝트에 수동 배포하려면 `.env.production.local`에 실제 값을 넣고 `npm run build` 후 `npx firebase deploy --only hosting,firestore:rules --project <프로젝트ID>`를 실행합니다.
