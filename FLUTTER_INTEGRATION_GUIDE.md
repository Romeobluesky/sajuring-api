# 사주링(Sajuring) API Flutter 연동 가이드

## 개요

이 문서는 사주링 Node.js API 서버와 Flutter 앱을 연동하기 위한 상세 가이드입니다.

## API 서버 정보

- **서버 URL**: `http://localhost:3001` (개발환경)
- **Base URL**: `/api`
- **인증 방식**: JWT Bearer Token
- **Content-Type**: `application/json`

## 📋 API 엔드포인트 목록

### 🏥 Health Check
```
GET /health
```
서버 상태 확인

### 🔐 인증 (Authentication)

#### 회원가입
```
POST /api/auth/register
```
**요청 Body:**
```json
{
  "email": "user@example.com",
  "password": "password123!",
  "username": "user123",
  "nickname": "사용자닉네임",
  "phone": "010-1234-5678",
  "birth_date": "1990-01-01"
}
```

#### 로그인
```
POST /api/auth/login
```
**요청 Body:**
```json
{
  "loginId": "user123 또는 user@example.com",
  "password": "password123!"
}
```

#### 내 정보 조회
```
GET /api/auth/me
```
**헤더:** `Authorization: Bearer <token>`

### 👨‍💼 상담사 (Consultants)

#### 상담사 목록 조회
```
GET /api/consultants
```
**쿼리 파라미터:**
- `page` (옵셔널): 페이지 번호 (기본값: 1)
- `limit` (옵셔널): 페이지당 개수 (기본값: 20)
- `specialty` (옵셔널): 전문분야 필터
- `status` (옵셔널): 상태 필터

#### 상담사 상세 조회
```
GET /api/consultants/:id
```

### 💍 링 (Rings) - 인증 필요

#### 링 잔액 조회
```
GET /api/rings/balance
```
**헤더:** `Authorization: Bearer <token>`

#### 링 구매
```
POST /api/rings/purchase
```
**헤더:** `Authorization: Bearer <token>`
**요청 Body:**
```json
{
  "amount": 100,
  "payment_method": "credit_card"
}
```

#### 링 전송
```
POST /api/rings/transfer
```
**헤더:** `Authorization: Bearer <token>`
**요청 Body:**
```json
{
  "recipient_id": 123,
  "amount": 50,
  "message": "선물입니다"
}
```

### ❓ FAQ

#### FAQ 목록 조회
```
GET /api/faq
```
**쿼리 파라미터:**
- `page` (옵셔널): 페이지 번호
- `limit` (옵셔널): 페이지당 개수
- `category` (옵셔널): 카테고리 필터

### 📝 문의사항 (Inquiries) - 인증 필요

#### 문의사항 등록
```
POST /api/inquiries
```
**헤더:** `Authorization: Bearer <token>`
**요청 Body:**
```json
{
  "inquiry_title": "문의 제목",
  "inquiry_context": "문의 내용",
  "inquiry_type": "일반문의"
}
```

#### 내 문의사항 조회
```
GET /api/inquiries/my
```
**헤더:** `Authorization: Bearer <token>`

### 🎉 이벤트 (Events)

#### 이벤트 목록 조회
```
GET /api/events
```
**쿼리 파라미터:**
- `event_type` (옵셔널): 이벤트 타입 필터
- `event_state` (옵셔널): 이벤트 상태 필터 (기본값: "active")

#### 이벤트 상세 조회
```
GET /api/events/:id
```

### 🧪 테스트 엔드포인트

#### 데이터베이스 테이블 목록
```
GET /api/test/tables
```

#### 사용자 수 조회
```
GET /api/test/users-count
```

#### 상담사 수 조회
```
GET /api/test/consultants-count
```

## 🔧 Flutter 연동 설정

### 1. 의존성 추가

`pubspec.yaml`에 HTTP 클라이언트 라이브러리 추가:

```yaml
dependencies:
  http: ^1.1.0
  shared_preferences: ^2.2.2
```

### 2. API 서비스 클래스 생성

```dart
// lib/services/api_service.dart
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

class ApiService {
  static const String baseUrl = 'http://10.0.2.2:3001/api'; // Android Emulator
  // static const String baseUrl = 'http://localhost:3001/api'; // iOS Simulator
  
  // 토큰 저장/조회 메서드
  static Future<String?> getToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('auth_token');
  }
  
  static Future<void> saveToken(String token) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('auth_token', token);
  }
  
  static Future<void> removeToken() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('auth_token');
  }
  
  // HTTP 헤더 생성
  static Future<Map<String, String>> _getHeaders({bool includeAuth = false}) async {
    final headers = <String, String>{
      'Content-Type': 'application/json',
    };
    
    if (includeAuth) {
      final token = await getToken();
      if (token != null) {
        headers['Authorization'] = 'Bearer $token';
      }
    }
    
    return headers;
  }
  
  // GET 요청
  static Future<http.Response> get(String endpoint, {bool requireAuth = false}) async {
    final headers = await _getHeaders(includeAuth: requireAuth);
    final url = Uri.parse('$baseUrl$endpoint');
    
    return await http.get(url, headers: headers);
  }
  
  // POST 요청
  static Future<http.Response> post(String endpoint, {
    required Map<String, dynamic> body,
    bool requireAuth = false,
  }) async {
    final headers = await _getHeaders(includeAuth: requireAuth);
    final url = Uri.parse('$baseUrl$endpoint');
    
    return await http.post(
      url,
      headers: headers,
      body: json.encode(body),
    );
  }
}
```

### 3. 응답 모델 클래스

```dart
// lib/models/api_response.dart
class ApiResponse<T> {
  final bool success;
  final String message;
  final T? data;
  final String? error;
  final String? code;
  final int? statusCode;

  ApiResponse({
    required this.success,
    required this.message,
    this.data,
    this.error,
    this.code,
    this.statusCode,
  });

  factory ApiResponse.fromJson(Map<String, dynamic> json, T Function(dynamic)? fromJsonT) {
    return ApiResponse(
      success: json['success'] ?? false,
      message: json['message'] ?? '',
      data: json['data'] != null && fromJsonT != null ? fromJsonT(json['data']) : json['data'],
      error: json['error'],
      code: json['code'],
      statusCode: json['statusCode'],
    );
  }
}
```

### 4. 사용자 모델

```dart
// lib/models/user.dart
class User {
  final int id;
  final String username;
  final String email;
  final String nickname;
  final String? phone;
  final String? birthDate;
  final String role;
  final int rings;
  final String status;

  User({
    required this.id,
    required this.username,
    required this.email,
    required this.nickname,
    this.phone,
    this.birthDate,
    required this.role,
    required this.rings,
    required this.status,
  });

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: json['id'],
      username: json['username'],
      email: json['email'],
      nickname: json['nickname'],
      phone: json['phone'],
      birthDate: json['birth_date'],
      role: json['role'],
      rings: json['rings'] ?? 0,
      status: json['status'],
    );
  }
}
```

### 5. 인증 서비스

```dart
// lib/services/auth_service.dart
import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/api_response.dart';
import '../models/user.dart';
import 'api_service.dart';

class AuthService {
  // 회원가입
  static Future<ApiResponse<Map<String, dynamic>>> register({
    required String email,
    required String password,
    required String username,
    required String nickname,
    required String phone,
    required String birthDate,
  }) async {
    try {
      final response = await ApiService.post('/auth/register', body: {
        'email': email,
        'password': password,
        'username': username,
        'nickname': nickname,
        'phone': phone,
        'birth_date': birthDate,
      });

      final jsonResponse = json.decode(response.body);
      
      if (response.statusCode == 201 && jsonResponse['success']) {
        // 토큰 저장
        if (jsonResponse['data']['token'] != null) {
          await ApiService.saveToken(jsonResponse['data']['token']);
        }
      }
      
      return ApiResponse.fromJson(jsonResponse, (data) => data as Map<String, dynamic>);
    } catch (e) {
      return ApiResponse(
        success: false,
        message: '네트워크 오류가 발생했습니다.',
        error: e.toString(),
      );
    }
  }

  // 로그인
  static Future<ApiResponse<Map<String, dynamic>>> login({
    required String loginId,
    required String password,
  }) async {
    try {
      final response = await ApiService.post('/auth/login', body: {
        'loginId': loginId,
        'password': password,
      });

      final jsonResponse = json.decode(response.body);
      
      if (response.statusCode == 200 && jsonResponse['success']) {
        // 토큰 저장
        if (jsonResponse['data']['token'] != null) {
          await ApiService.saveToken(jsonResponse['data']['token']);
        }
      }
      
      return ApiResponse.fromJson(jsonResponse, (data) => data as Map<String, dynamic>);
    } catch (e) {
      return ApiResponse(
        success: false,
        message: '네트워크 오류가 발생했습니다.',
        error: e.toString(),
      );
    }
  }

  // 내 정보 조회
  static Future<ApiResponse<User>> getMe() async {
    try {
      final response = await ApiService.get('/auth/me', requireAuth: true);
      final jsonResponse = json.decode(response.body);
      
      return ApiResponse.fromJson(jsonResponse, (data) => User.fromJson(data['user']));
    } catch (e) {
      return ApiResponse(
        success: false,
        message: '네트워크 오류가 발생했습니다.',
        error: e.toString(),
      );
    }
  }

  // 로그아웃
  static Future<void> logout() async {
    await ApiService.removeToken();
  }
}
```

### 6. 상담사 서비스

```dart
// lib/services/consultant_service.dart
import 'dart:convert';
import '../models/api_response.dart';
import 'api_service.dart';

class Consultant {
  final int id;
  final String consultantName;
  final String specialty;
  final int experience;
  final String status;
  final List<String> introImages;

  Consultant({
    required this.id,
    required this.consultantName,
    required this.specialty,
    required this.experience,
    required this.status,
    required this.introImages,
  });

  factory Consultant.fromJson(Map<String, dynamic> json) {
    return Consultant(
      id: json['id'],
      consultantName: json['consultant_name'],
      specialty: json['specialty'],
      experience: json['experience'],
      status: json['status'],
      introImages: (json['intro_images'] as List?)?.cast<String>() ?? [],
    );
  }
}

class ConsultantService {
  // 상담사 목록 조회
  static Future<ApiResponse<Map<String, dynamic>>> getConsultants({
    int page = 1,
    int limit = 20,
    String? specialty,
    String? status,
  }) async {
    try {
      String endpoint = '/consultants?page=$page&limit=$limit';
      if (specialty != null) endpoint += '&specialty=$specialty';
      if (status != null) endpoint += '&status=$status';

      final response = await ApiService.get(endpoint);
      final jsonResponse = json.decode(response.body);
      
      return ApiResponse.fromJson(jsonResponse, (data) => data as Map<String, dynamic>);
    } catch (e) {
      return ApiResponse(
        success: false,
        message: '네트워크 오류가 발생했습니다.',
        error: e.toString(),
      );
    }
  }

  // 상담사 상세 조회
  static Future<ApiResponse<Consultant>> getConsultant(int id) async {
    try {
      final response = await ApiService.get('/consultants/$id');
      final jsonResponse = json.decode(response.body);
      
      return ApiResponse.fromJson(jsonResponse, (data) => Consultant.fromJson(data['consultant']));
    } catch (e) {
      return ApiResponse(
        success: false,
        message: '네트워크 오류가 발생했습니다.',
        error: e.toString(),
      );
    }
  }
}
```

## 🎯 사용 예제

### 로그인 화면 예제

```dart
// lib/screens/login_screen.dart
import 'package:flutter/material.dart';
import '../services/auth_service.dart';

class LoginScreen extends StatefulWidget {
  @override
  _LoginScreenState createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _loginIdController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _isLoading = false;

  Future<void> _login() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _isLoading = true);

    final result = await AuthService.login(
      loginId: _loginIdController.text,
      password: _passwordController.text,
    );

    setState(() => _isLoading = false);

    if (result.success) {
      // 로그인 성공
      Navigator.pushReplacementNamed(context, '/home');
    } else {
      // 로그인 실패
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(result.error ?? result.message)),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('로그인')),
      body: Padding(
        padding: EdgeInsets.all(16.0),
        child: Form(
          key: _formKey,
          child: Column(
            children: [
              TextFormField(
                controller: _loginIdController,
                decoration: InputDecoration(labelText: '사용자명 또는 이메일'),
                validator: (value) {
                  if (value == null || value.isEmpty) {
                    return '사용자명 또는 이메일을 입력해주세요';
                  }
                  return null;
                },
              ),
              SizedBox(height: 16),
              TextFormField(
                controller: _passwordController,
                decoration: InputDecoration(labelText: '비밀번호'),
                obscureText: true,
                validator: (value) {
                  if (value == null || value.isEmpty) {
                    return '비밀번호를 입력해주세요';
                  }
                  return null;
                },
              ),
              SizedBox(height: 24),
              _isLoading
                  ? CircularProgressIndicator()
                  : ElevatedButton(
                      onPressed: _login,
                      child: Text('로그인'),
                    ),
            ],
          ),
        ),
      ),
    );
  }
}
```

## 🔒 보안 고려사항

### 1. HTTPS 사용
프로덕션 환경에서는 반드시 HTTPS를 사용하세요.

### 2. 토큰 관리
- JWT 토큰을 안전하게 저장 (SharedPreferences 또는 Secure Storage)
- 토큰 만료 처리
- 자동 로그아웃 구현

### 3. 입력 검증
- 클라이언트 측에서도 입력 검증 수행
- XSS, SQL Injection 방어

### 4. 네트워크 보안
```dart
// lib/services/api_service.dart에 추가
import 'dart:io';

class ApiService {
  static http.Client createHttpClient() {
    final client = http.Client();
    
    // 프로덕션에서 SSL 인증서 검증
    if (!kDebugMode) {
      (client as IOClient).httpClient.badCertificateCallback = (cert, host, port) => false;
    }
    
    return client;
  }
}
```

## 🌐 네트워크 설정

### Android
`android/app/src/main/AndroidManifest.xml`에 권한 추가:
```xml
<uses-permission android:name="android.permission.INTERNET" />
```

### iOS
`ios/Runner/Info.plist`에 HTTP 허용 추가 (개발환경용):
```xml
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsArbitraryLoads</key>
    <true/>
</dict>
```

## 📱 테스트 가이드

### 1. API 연결 테스트
```dart
// lib/services/health_check.dart
class HealthCheckService {
  static Future<bool> checkServerHealth() async {
    try {
      final response = await http.get(Uri.parse('http://10.0.2.2:3001/health'));
      return response.statusCode == 200;
    } catch (e) {
      return false;
    }
  }
}
```

### 2. 에러 처리
```dart
void handleApiError(ApiResponse response) {
  switch (response.code) {
    case 'AUTHENTICATION_ERROR':
      // 로그인 페이지로 이동
      break;
    case 'VALIDATION_ERROR':
      // 입력 오류 처리
      break;
    case 'SERVER_ERROR':
      // 서버 오류 처리
      break;
    default:
      // 기본 오류 처리
      break;
  }
}
```

## 📊 테스트 결과

현재 API 서버 테스트 결과:
- ✅ Health Check: 정상 동작
- ✅ 상담사 목록 조회: 11명 등록
- ✅ FAQ 조회: 10개 항목
- ✅ 이벤트 조회: 1개 활성 이벤트
- ✅ 테스트 엔드포인트: 모두 정상
- ✅ 데이터베이스 연결: 정상
- ✅ 인증 시스템: JWT 토큰 기반 동작

## 🚀 배포 시 고려사항

1. **환경별 API URL 관리**
   ```dart
   class Config {
     static const String baseUrl = String.fromEnvironment(
       'API_BASE_URL',
       defaultValue: 'http://10.0.2.2:3001/api',
     );
   }
   ```

2. **API 버전 관리**
   - API 버전별 호환성 관리
   - 하위 호환성 유지

3. **캐싱 전략**
   - 오프라인 기능 구현
   - 데이터 캐싱으로 성능 최적화

이 가이드를 참고하여 Flutter 앱과 사주링 API를 성공적으로 연동하시기 바랍니다.