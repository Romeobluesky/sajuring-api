# 사주링(Sajuring) API Flutter 연동 가이드

## 📋 개요

이 문서는 배포된 사주링 Node.js API 서버와 Flutter 앱을 연동하기 위한 완전한 개발 가이드입니다.

## 🌐 API 서버 정보

### 배포된 서버 환경
- **프로덕션 서버**: `https://api.sajuring.co.kr`
- **개발 테스트**: `http://1.234.2.37:3013`
- **Base URL**: `/api`
- **인증 방식**: JWT Bearer Token
- **Content-Type**: `application/json`

### 서버 상태 확인
```bash
# HTTPS (프로덕션)
curl https://api.sajuring.co.kr/health

# HTTP (개발 테스트)
curl http://1.234.2.37:3013/health
```

## 🚀 Flutter 프로젝트 설정

### 1. 새 Flutter 프로젝트 생성
```bash
flutter create sajuring_app
cd sajuring_app
```

### 2. 의존성 추가
`pubspec.yaml`에 필요한 패키지들을 추가합니다:

```yaml
dependencies:
  flutter:
    sdk: flutter
  
  # HTTP 통신
  http: ^1.1.0
  dio: ^5.3.2
  
  # 로컬 저장소 (토큰 관리)
  shared_preferences: ^2.2.2
  flutter_secure_storage: ^9.0.0
  
  # 상태 관리
  provider: ^6.1.1
  
  # JSON 직렬화
  json_annotation: ^4.8.1
  
  # UI 관련
  flutter_spinkit: ^5.2.0
  cached_network_image: ^3.3.0

dev_dependencies:
  flutter_test:
    sdk: flutter
  
  # 코드 생성
  build_runner: ^2.4.7
  json_serializable: ^6.7.1
  
  flutter_lints: ^3.0.0
```

### 3. 패키지 설치
```bash
flutter pub get
```

## 🔧 프로젝트 구조 설정

```
lib/
├── main.dart
├── config/
│   └── api_config.dart
├── models/
│   ├── api_response.dart
│   ├── user.dart
│   ├── consultant.dart
│   └── auth_response.dart
├── services/
│   ├── api_service.dart
│   ├── auth_service.dart
│   ├── consultant_service.dart
│   └── storage_service.dart
├── providers/
│   ├── auth_provider.dart
│   └── consultant_provider.dart
├── screens/
│   ├── auth/
│   │   ├── login_screen.dart
│   │   └── register_screen.dart
│   ├── home/
│   │   └── home_screen.dart
│   └── consultant/
│       └── consultant_list_screen.dart
└── widgets/
    ├── loading_widget.dart
    └── error_widget.dart
```

## ⚙️ 환경 설정

### 1. API 설정 파일
```dart
// lib/config/api_config.dart
class ApiConfig {
  // 환경별 API URL 설정
  static const String _prodBaseUrl = 'https://api.sajuring.co.kr';
  static const String _devBaseUrl = 'http://1.234.2.37:3013';
  
  // 개발 환경 감지
  static bool get isProduction => const bool.fromEnvironment('dart.vm.product');
  
  // 현재 환경에 맞는 Base URL
  static String get baseUrl => isProduction ? _prodBaseUrl : _devBaseUrl;
  
  // API Base URL
  static String get apiBaseUrl => '$baseUrl/api';
  
  // 기본 헤더
  static Map<String, String> get defaultHeaders => {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
  
  // 타임아웃 설정
  static const Duration connectionTimeout = Duration(seconds: 30);
  static const Duration receiveTimeout = Duration(seconds: 30);
  
  // 플랫폼별 URL (개발시 사용)
  static String getDevUrl() {
    // Android 에뮬레이터
    if (defaultTargetPlatform == TargetPlatform.android) {
      return 'http://10.0.2.2:3013';
    }
    // iOS 시뮬레이터 또는 실제 기기
    return 'http://localhost:3013';
  }
}
```

### 2. 안전한 저장소 서비스
```dart
// lib/services/storage_service.dart
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

class StorageService {
  static const FlutterSecureStorage _secureStorage = FlutterSecureStorage(
    aOptions: AndroidOptions(
      encryptedSharedPreferences: true,
    ),
    iOptions: IOSOptions(
      accessibility: IOSAccessibility.first_unlock_this_device,
    ),
  );
  
  // JWT 토큰 저장/조회 (보안 저장소)
  static Future<void> saveToken(String token) async {
    await _secureStorage.write(key: 'auth_token', value: token);
  }
  
  static Future<String?> getToken() async {
    return await _secureStorage.read(key: 'auth_token');
  }
  
  static Future<void> removeToken() async {
    await _secureStorage.delete(key: 'auth_token');
  }
  
  // 사용자 정보 저장/조회 (일반 저장소)
  static Future<void> saveUserInfo(Map<String, dynamic> userInfo) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('user_info', jsonEncode(userInfo));
  }
  
  static Future<Map<String, dynamic>?> getUserInfo() async {
    final prefs = await SharedPreferences.getInstance();
    final userInfoString = prefs.getString('user_info');
    if (userInfoString != null) {
      return jsonDecode(userInfoString);
    }
    return null;
  }
  
  static Future<void> removeUserInfo() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('user_info');
  }
  
  // 모든 데이터 삭제 (로그아웃시)
  static Future<void> clearAll() async {
    await removeToken();
    await removeUserInfo();
  }
}
```

## 📱 모델 클래스 정의

### 1. API 응답 모델
```dart
// lib/models/api_response.dart
import 'package:json_annotation/json_annotation.dart';

part 'api_response.g.dart';

@JsonSerializable(genericArgumentFactories: true)
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

  factory ApiResponse.fromJson(
    Map<String, dynamic> json,
    T Function(Object? json) fromJsonT,
  ) => _$ApiResponseFromJson(json, fromJsonT);

  Map<String, dynamic> toJson(Object? Function(T value) toJsonT) =>
      _$ApiResponseToJson(this, toJsonT);

  // 성공 응답 생성
  factory ApiResponse.success({
    required T data,
    String message = 'Success',
  }) {
    return ApiResponse(
      success: true,
      message: message,
      data: data,
    );
  }

  // 오류 응답 생성
  factory ApiResponse.error({
    required String message,
    String? error,
    String? code,
    int? statusCode,
  }) {
    return ApiResponse(
      success: false,
      message: message,
      error: error,
      code: code,
      statusCode: statusCode,
    );
  }
}
```

### 2. 사용자 모델
```dart
// lib/models/user.dart
import 'package:json_annotation/json_annotation.dart';

part 'user.g.dart';

@JsonSerializable()
class User {
  final int id;
  @JsonKey(name: 'login_id')
  final String? loginId;
  final String username;
  final String email;
  final String? nickname;
  final String? phone;
  @JsonKey(name: 'birth_date')
  final String? birthDate;
  final String? gender;
  final String role;
  final int rings;
  final String status;
  @JsonKey(name: 'role_level')
  final int roleLevel;
  @JsonKey(name: 'profile_image')
  final String? profileImage;
  @JsonKey(name: 'created_at')
  final String? createdAt;
  @JsonKey(name: 'updated_at')
  final String? updatedAt;

  User({
    required this.id,
    this.loginId,
    required this.username,
    required this.email,
    this.nickname,
    this.phone,
    this.birthDate,
    this.gender,
    required this.role,
    required this.rings,
    required this.status,
    required this.roleLevel,
    this.profileImage,
    this.createdAt,
    this.updatedAt,
  });

  factory User.fromJson(Map<String, dynamic> json) => _$UserFromJson(json);
  Map<String, dynamic> toJson() => _$UserToJson(this);

  // 관리자 여부 확인
  bool get isAdmin => role == 'ADMIN';
  
  // 상담사 여부 확인
  bool get isConsultant => role == 'CONSULTANT';
  
  // 일반 사용자 여부 확인
  bool get isUser => role == 'USER';
}
```

### 3. 상담사 모델
```dart
// lib/models/consultant.dart
import 'package:json_annotation/json_annotation.dart';

part 'consultant.g.dart';

@JsonSerializable()
class Consultant {
  final int id;
  @JsonKey(name: 'consultant_number')
  final String consultantNumber;
  @JsonKey(name: 'user_id')
  final int userId;
  final String name;
  final String nickname;
  @JsonKey(name: 'stage_name')
  final String stageName;
  final String phone;
  final String email;
  @JsonKey(name: 'profile_image')
  final String? profileImage;
  @JsonKey(name: 'intro_images')
  final List<String> introImages;
  final String? introduction;
  final String? career;
  final String? region;
  @JsonKey(name: 'consultant_grade')
  final String consultantGrade;
  @JsonKey(name: 'consultation_field')
  final String consultationField;
  @JsonKey(name: 'consultation_fee')
  final double? consultationFee;
  final int rings;
  @JsonKey(name: 'consultation_rate')
  final double consultationRate;
  final String status;
  final List<int> specialties;
  @JsonKey(name: 'consultation_styles')
  final List<int> consultationStyles;
  @JsonKey(name: 'created_at')
  final String? createdAt;
  @JsonKey(name: 'updated_at')
  final String? updatedAt;

  Consultant({
    required this.id,
    required this.consultantNumber,
    required this.userId,
    required this.name,
    required this.nickname,
    required this.stageName,
    required this.phone,
    required this.email,
    this.profileImage,
    required this.introImages,
    this.introduction,
    this.career,
    this.region,
    required this.consultantGrade,
    required this.consultationField,
    this.consultationFee,
    required this.rings,
    required this.consultationRate,
    required this.status,
    required this.specialties,
    required this.consultationStyles,
    this.createdAt,
    this.updatedAt,
  });

  factory Consultant.fromJson(Map<String, dynamic> json) => _$ConsultantFromJson(json);
  Map<String, dynamic> toJson() => _$ConsultantToJson(this);

  // 활성 상태 여부
  bool get isActive => status == 'active';
  
  // 평점 표시용 (소수점 1자리)
  String get ratingDisplay => consultationRate.toStringAsFixed(1);
  
  // 상담료 표시용 (정수로 표시)
  String get feeDisplay => consultationFee?.toInt().toString() ?? '무료';
}
```

## 🔗 API 서비스 클래스

### 1. 기본 API 서비스
```dart
// lib/services/api_service.dart
import 'dart:convert';
import 'dart:io';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import '../config/api_config.dart';
import '../models/api_response.dart';
import 'storage_service.dart';

class ApiService {
  static late Dio _dio;
  
  // 싱글톤 인스턴스
  static final ApiService _instance = ApiService._internal();
  factory ApiService() => _instance;
  ApiService._internal();

  // 초기화
  static Future<void> initialize() async {
    _dio = Dio(BaseOptions(
      baseUrl: ApiConfig.apiBaseUrl,
      connectTimeout: ApiConfig.connectionTimeout,
      receiveTimeout: ApiConfig.receiveTimeout,
      headers: ApiConfig.defaultHeaders,
    ));

    // 인터셉터 추가
    _dio.interceptors.add(AuthInterceptor());
    _dio.interceptors.add(LoggingInterceptor());
    _dio.interceptors.add(ErrorInterceptor());
  }

  // GET 요청
  static Future<ApiResponse<T>> get<T>(
    String endpoint, {
    Map<String, dynamic>? queryParameters,
    bool requireAuth = false,
    T Function(dynamic)? fromJson,
  }) async {
    try {
      final response = await _dio.get(
        endpoint,
        queryParameters: queryParameters,
        options: Options(
          extra: {'requireAuth': requireAuth},
        ),
      );

      return _handleResponse<T>(response, fromJson);
    } catch (e) {
      return _handleError<T>(e);
    }
  }

  // POST 요청
  static Future<ApiResponse<T>> post<T>(
    String endpoint, {
    dynamic data,
    bool requireAuth = false,
    T Function(dynamic)? fromJson,
  }) async {
    try {
      final response = await _dio.post(
        endpoint,
        data: data,
        options: Options(
          extra: {'requireAuth': requireAuth},
        ),
      );

      return _handleResponse<T>(response, fromJson);
    } catch (e) {
      return _handleError<T>(e);
    }
  }

  // PUT 요청
  static Future<ApiResponse<T>> put<T>(
    String endpoint, {
    dynamic data,
    bool requireAuth = false,
    T Function(dynamic)? fromJson,
  }) async {
    try {
      final response = await _dio.put(
        endpoint,
        data: data,
        options: Options(
          extra: {'requireAuth': requireAuth},
        ),
      );

      return _handleResponse<T>(response, fromJson);
    } catch (e) {
      return _handleError<T>(e);
    }
  }

  // DELETE 요청
  static Future<ApiResponse<T>> delete<T>(
    String endpoint, {
    bool requireAuth = false,
    T Function(dynamic)? fromJson,
  }) async {
    try {
      final response = await _dio.delete(
        endpoint,
        options: Options(
          extra: {'requireAuth': requireAuth},
        ),
      );

      return _handleResponse<T>(response, fromJson);
    } catch (e) {
      return _handleError<T>(e);
    }
  }

  // 응답 처리
  static ApiResponse<T> _handleResponse<T>(
    Response response,
    T Function(dynamic)? fromJson,
  ) {
    if (response.statusCode == 200 || response.statusCode == 201) {
      final data = response.data;
      
      if (data is Map<String, dynamic>) {
        if (data['success'] == true) {
          T? parsedData;
          if (fromJson != null && data['data'] != null) {
            parsedData = fromJson(data['data']);
          } else {
            parsedData = data['data'] as T?;
          }
          
          return ApiResponse<T>(
            success: true,
            message: data['message'] ?? 'Success',
            data: parsedData,
          );
        } else {
          return ApiResponse<T>(
            success: false,
            message: data['message'] ?? 'Unknown error',
            error: data['error'],
            code: data['code'],
            statusCode: response.statusCode,
          );
        }
      }
    }

    return ApiResponse<T>(
      success: false,
      message: 'Unexpected response format',
      statusCode: response.statusCode,
    );
  }

  // 오류 처리
  static ApiResponse<T> _handleError<T>(dynamic error) {
    if (error is DioException) {
      switch (error.type) {
        case DioExceptionType.connectionTimeout:
          return ApiResponse<T>.error(
            message: '연결 시간이 초과되었습니다.',
            code: 'CONNECTION_TIMEOUT',
          );
        case DioExceptionType.receiveTimeout:
          return ApiResponse<T>.error(
            message: '응답 시간이 초과되었습니다.',
            code: 'RECEIVE_TIMEOUT',
          );
        case DioExceptionType.badResponse:
          final data = error.response?.data;
          if (data is Map<String, dynamic>) {
            return ApiResponse<T>.error(
              message: data['message'] ?? '서버 오류가 발생했습니다.',
              error: data['error'],
              code: data['code'],
              statusCode: error.response?.statusCode,
            );
          }
          return ApiResponse<T>.error(
            message: '서버 오류가 발생했습니다.',
            statusCode: error.response?.statusCode,
          );
        case DioExceptionType.cancel:
          return ApiResponse<T>.error(
            message: '요청이 취소되었습니다.',
            code: 'REQUEST_CANCELLED',
          );
        default:
          return ApiResponse<T>.error(
            message: '네트워크 오류가 발생했습니다.',
            code: 'NETWORK_ERROR',
          );
      }
    }

    return ApiResponse<T>.error(
      message: '알 수 없는 오류가 발생했습니다.',
      error: error.toString(),
      code: 'UNKNOWN_ERROR',
    );
  }
}

// 인증 인터셉터
class AuthInterceptor extends Interceptor {
  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) async {
    final requireAuth = options.extra['requireAuth'] as bool? ?? false;
    
    if (requireAuth) {
      final token = await StorageService.getToken();
      if (token != null) {
        options.headers['Authorization'] = 'Bearer $token';
      }
    }
    
    handler.next(options);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) async {
    // 401 에러시 토큰 삭제 및 로그인 화면으로 이동
    if (err.response?.statusCode == 401) {
      await StorageService.clearAll();
      // 로그인 화면으로 이동하는 로직 추가
    }
    
    handler.next(err);
  }
}

// 로깅 인터셉터
class LoggingInterceptor extends Interceptor {
  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    if (kDebugMode) {
      print('🚀 REQUEST: ${options.method} ${options.path}');
      print('📝 Data: ${options.data}');
      print('🔑 Headers: ${options.headers}');
    }
    handler.next(options);
  }

  @override
  void onResponse(Response response, ResponseInterceptorHandler handler) {
    if (kDebugMode) {
      print('✅ RESPONSE: ${response.statusCode} ${response.requestOptions.path}');
      print('📦 Data: ${response.data}');
    }
    handler.next(response);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    if (kDebugMode) {
      print('❌ ERROR: ${err.response?.statusCode} ${err.requestOptions.path}');
      print('💥 Message: ${err.message}');
      print('📦 Data: ${err.response?.data}');
    }
    handler.next(err);
  }
}

// 오류 인터셉터
class ErrorInterceptor extends Interceptor {
  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    // 특정 오류 코드에 대한 전역 처리
    final statusCode = err.response?.statusCode;
    
    switch (statusCode) {
      case 401:
        // 인증 오류 - 로그아웃 처리
        _handleAuthError();
        break;
      case 403:
        // 권한 오류 - 권한 없음 메시지
        _handlePermissionError();
        break;
      case 404:
        // 리소스 없음
        _handleNotFoundError();
        break;
      case 500:
        // 서버 오류
        _handleServerError();
        break;
    }
    
    handler.next(err);
  }

  void _handleAuthError() {
    // 인증 오류 처리 로직
  }

  void _handlePermissionError() {
    // 권한 오류 처리 로직
  }

  void _handleNotFoundError() {
    // 404 오류 처리 로직
  }

  void _handleServerError() {
    // 서버 오류 처리 로직
  }
}
```

### 2. 인증 서비스
```dart
// lib/services/auth_service.dart
import '../models/api_response.dart';
import '../models/user.dart';
import 'api_service.dart';
import 'storage_service.dart';

class AuthService {
  // 회원가입
  static Future<ApiResponse<Map<String, dynamic>>> register({
    required String email,
    required String password,
    required String loginId,
    required String username,
    required String nickname,
    required String phone,
    required String birthDate,
    required String gender,
    required String policy,
  }) async {
    final response = await ApiService.post<Map<String, dynamic>>(
      '/auth/register',
      data: {
        'email': email,
        'password': password,
        'login_id': loginId,
        'username': username,
        'nickname': nickname,
        'phone': phone,
        'birth_date': birthDate,
        'gender': gender,
        'policy': policy,
      },
      fromJson: (data) => data as Map<String, dynamic>,
    );

    // 회원가입 성공시 토큰 저장
    if (response.success && response.data?['token'] != null) {
      await StorageService.saveToken(response.data!['token']);
      if (response.data?['user'] != null) {
        await StorageService.saveUserInfo(response.data!['user']);
      }
    }

    return response;
  }

  // 로그인
  static Future<ApiResponse<Map<String, dynamic>>> login({
    required String loginId,
    required String password,
  }) async {
    final response = await ApiService.post<Map<String, dynamic>>(
      '/auth/login',
      data: {
        'loginId': loginId,
        'password': password,
      },
      fromJson: (data) => data as Map<String, dynamic>,
    );

    // 로그인 성공시 토큰 저장
    if (response.success && response.data?['token'] != null) {
      await StorageService.saveToken(response.data!['token']);
      if (response.data?['user'] != null) {
        await StorageService.saveUserInfo(response.data!['user']);
      }
    }

    return response;
  }

  // 내 정보 조회
  static Future<ApiResponse<User>> getMe() async {
    return await ApiService.get<User>(
      '/auth/me',
      requireAuth: true,
      fromJson: (data) => User.fromJson(data['user']),
    );
  }

  // 로그아웃
  static Future<void> logout() async {
    await StorageService.clearAll();
  }

  // 로그인 상태 확인
  static Future<bool> isLoggedIn() async {
    final token = await StorageService.getToken();
    return token != null;
  }

  // 토큰 유효성 검사
  static Future<bool> validateToken() async {
    final token = await StorageService.getToken();
    if (token == null) return false;

    final response = await getMe();
    return response.success;
  }
}
```

### 3. 상담사 서비스
```dart
// lib/services/consultant_service.dart
import '../models/api_response.dart';
import '../models/consultant.dart';
import 'api_service.dart';

class ConsultantService {
  // 상담사 목록 조회
  static Future<ApiResponse<Map<String, dynamic>>> getConsultants({
    int page = 1,
    int limit = 20,
    String? consultationField,
    String? consultantGrade,
    String? status,
    List<int>? specialties,
    List<int>? consultationStyles,
  }) async {
    final queryParams = <String, dynamic>{
      'page': page,
      'limit': limit,
    };

    if (consultationField != null) {
      queryParams['consultation_field'] = consultationField;
    }
    if (consultantGrade != null) {
      queryParams['consultant_grade'] = consultantGrade;
    }
    if (status != null) {
      queryParams['status'] = status;
    }
    if (specialties != null && specialties.isNotEmpty) {
      queryParams['specialties'] = specialties.join(',');
    }
    if (consultationStyles != null && consultationStyles.isNotEmpty) {
      queryParams['consultation_styles'] = consultationStyles.join(',');
    }

    return await ApiService.get<Map<String, dynamic>>(
      '/consultants',
      queryParameters: queryParams,
      fromJson: (data) => data as Map<String, dynamic>,
    );
  }

  // 상담사 상세 조회
  static Future<ApiResponse<Consultant>> getConsultant(int id) async {
    return await ApiService.get<Consultant>(
      '/consultants/$id',
      fromJson: (data) => Consultant.fromJson(data['consultant']),
    );
  }

  // 전문분야 목록 조회
  static Future<ApiResponse<List<Map<String, dynamic>>>> getSpecialties() async {
    return await ApiService.get<List<Map<String, dynamic>>>(
      '/specialties',
      fromJson: (data) => List<Map<String, dynamic>>.from(data['specialties']),
    );
  }

  // 상담스타일 목록 조회
  static Future<ApiResponse<List<Map<String, dynamic>>>> getConsultationStyles() async {
    return await ApiService.get<List<Map<String, dynamic>>>(
      '/consultation-styles',
      fromJson: (data) => List<Map<String, dynamic>>.from(data['consultation_styles']),
    );
  }
}
```

## 🎯 상태 관리 (Provider)

### 1. 인증 Provider
```dart
// lib/providers/auth_provider.dart
import 'package:flutter/foundation.dart';
import '../models/user.dart';
import '../models/api_response.dart';
import '../services/auth_service.dart';

class AuthProvider with ChangeNotifier {
  User? _user;
  bool _isLoading = false;
  String? _errorMessage;

  User? get user => _user;
  bool get isLoading => _isLoading;
  String? get errorMessage => _errorMessage;
  bool get isLoggedIn => _user != null;

  // 로그인
  Future<bool> login(String loginId, String password) async {
    _setLoading(true);
    _clearError();

    try {
      final response = await AuthService.login(
        loginId: loginId,
        password: password,
      );

      if (response.success && response.data?['user'] != null) {
        _user = User.fromJson(response.data!['user']);
        notifyListeners();
        return true;
      } else {
        _setError(response.error ?? response.message);
        return false;
      }
    } catch (e) {
      _setError('로그인 중 오류가 발생했습니다.');
      return false;
    } finally {
      _setLoading(false);
    }
  }

  // 회원가입
  Future<bool> register({
    required String email,
    required String password,
    required String loginId,
    required String username,
    required String nickname,
    required String phone,
    required String birthDate,
    required String gender,
    required String policy,
  }) async {
    _setLoading(true);
    _clearError();

    try {
      final response = await AuthService.register(
        email: email,
        password: password,
        loginId: loginId,
        username: username,
        nickname: nickname,
        phone: phone,
        birthDate: birthDate,
        gender: gender,
        policy: policy,
      );

      if (response.success && response.data?['user'] != null) {
        _user = User.fromJson(response.data!['user']);
        notifyListeners();
        return true;
      } else {
        _setError(response.error ?? response.message);
        return false;
      }
    } catch (e) {
      _setError('회원가입 중 오류가 발생했습니다.');
      return false;
    } finally {
      _setLoading(false);
    }
  }

  // 내 정보 조회
  Future<void> loadUserInfo() async {
    _setLoading(true);

    try {
      final response = await AuthService.getMe();
      if (response.success && response.data != null) {
        _user = response.data;
        notifyListeners();
      }
    } catch (e) {
      _setError('사용자 정보를 불러오는데 실패했습니다.');
    } finally {
      _setLoading(false);
    }
  }

  // 로그아웃
  Future<void> logout() async {
    await AuthService.logout();
    _user = null;
    _clearError();
    notifyListeners();
  }

  // 로그인 상태 확인
  Future<void> checkAuthStatus() async {
    final isLoggedIn = await AuthService.isLoggedIn();
    if (isLoggedIn) {
      await loadUserInfo();
    }
  }

  void _setLoading(bool loading) {
    _isLoading = loading;
    notifyListeners();
  }

  void _setError(String error) {
    _errorMessage = error;
    notifyListeners();
  }

  void _clearError() {
    _errorMessage = null;
  }
}
```

## 🖼️ UI 화면 구현

### 1. 로그인 화면
```dart
// lib/screens/auth/login_screen.dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import '../../widgets/loading_widget.dart';

class LoginScreen extends StatefulWidget {
  @override
  _LoginScreenState createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _loginIdController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _obscurePassword = true;

  @override
  void dispose() {
    _loginIdController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    if (!_formKey.currentState!.validate()) return;

    final authProvider = Provider.of<AuthProvider>(context, listen: false);
    
    final success = await authProvider.login(
      _loginIdController.text.trim(),
      _passwordController.text,
    );

    if (success) {
      Navigator.pushReplacementNamed(context, '/home');
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(authProvider.errorMessage ?? '로그인에 실패했습니다.'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('로그인'),
        elevation: 0,
      ),
      body: SafeArea(
        child: Padding(
          padding: EdgeInsets.all(24.0),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SizedBox(height: 40),
                
                // 로고 또는 앱 이름
                Text(
                  '사주링',
                  style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: Theme.of(context).primaryColor,
                  ),
                  textAlign: TextAlign.center,
                ),
                
                SizedBox(height: 40),
                
                // 사용자명 또는 이메일 입력
                TextFormField(
                  controller: _loginIdController,
                  decoration: InputDecoration(
                    labelText: '사용자명 또는 이메일',
                    prefixIcon: Icon(Icons.person),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  keyboardType: TextInputType.emailAddress,
                  validator: (value) {
                    if (value == null || value.trim().isEmpty) {
                      return '사용자명 또는 이메일을 입력해주세요';
                    }
                    return null;
                  },
                ),
                
                SizedBox(height: 20),
                
                // 비밀번호 입력
                TextFormField(
                  controller: _passwordController,
                  decoration: InputDecoration(
                    labelText: '비밀번호',
                    prefixIcon: Icon(Icons.lock),
                    suffixIcon: IconButton(
                      icon: Icon(_obscurePassword ? Icons.visibility : Icons.visibility_off),
                      onPressed: () {
                        setState(() {
                          _obscurePassword = !_obscurePassword;
                        });
                      },
                    ),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  obscureText: _obscurePassword,
                  validator: (value) {
                    if (value == null || value.isEmpty) {
                      return '비밀번호를 입력해주세요';
                    }
                    return null;
                  },
                ),
                
                SizedBox(height: 30),
                
                // 로그인 버튼
                Consumer<AuthProvider>(
                  builder: (context, authProvider, child) {
                    return ElevatedButton(
                      onPressed: authProvider.isLoading ? null : _login,
                      style: ElevatedButton.styleFrom(
                        padding: EdgeInsets.symmetric(vertical: 16),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                      child: authProvider.isLoading
                          ? LoadingWidget(size: 20)
                          : Text(
                              '로그인',
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                    );
                  },
                ),
                
                SizedBox(height: 20),
                
                // 회원가입 링크
                TextButton(
                  onPressed: () {
                    Navigator.pushNamed(context, '/register');
                  },
                  child: Text('회원가입'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
```

### 2. 메인 앱 설정
```dart
// lib/main.dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'config/api_config.dart';
import 'providers/auth_provider.dart';
import 'services/api_service.dart';
import 'screens/auth/login_screen.dart';
import 'screens/home/home_screen.dart';
import 'screens/auth/register_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  // API 서비스 초기화
  await ApiService.initialize();
  
  runApp(MyApp());
}

class MyApp extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AuthProvider()),
      ],
      child: MaterialApp(
        title: '사주링',
        theme: ThemeData(
          primarySwatch: Colors.purple,
          visualDensity: VisualDensity.adaptivePlatformDensity,
        ),
        home: SplashScreen(),
        routes: {
          '/login': (context) => LoginScreen(),
          '/register': (context) => RegisterScreen(),
          '/home': (context) => HomeScreen(),
        },
      ),
    );
  }
}

class SplashScreen extends StatefulWidget {
  @override
  _SplashScreenState createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  @override
  void initState() {
    super.initState();
    _checkAuthStatus();
  }

  Future<void> _checkAuthStatus() async {
    final authProvider = Provider.of<AuthProvider>(context, listen: false);
    await authProvider.checkAuthStatus();
    
    // 1초 후 화면 전환
    await Future.delayed(Duration(seconds: 1));
    
    if (authProvider.isLoggedIn) {
      Navigator.pushReplacementNamed(context, '/home');
    } else {
      Navigator.pushReplacementNamed(context, '/login');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.auto_awesome,
              size: 80,
              color: Theme.of(context).primaryColor,
            ),
            SizedBox(height: 20),
            Text(
              '사주링',
              style: Theme.of(context).textTheme.headlineLarge?.copyWith(
                fontWeight: FontWeight.bold,
                color: Theme.of(context).primaryColor,
              ),
            ),
            SizedBox(height: 40),
            CircularProgressIndicator(),
          ],
        ),
      ),
    );
  }
}
```

## 🔒 보안 고려사항

### 1. 네트워크 보안
```dart
// lib/config/network_config.dart
import 'dart:io';

class NetworkConfig {
  // SSL 인증서 핀닝 (프로덕션용)
  static SecurityContext? createSecurityContext() {
    if (ApiConfig.isProduction) {
      final context = SecurityContext();
      // 사주링 SSL 인증서 추가
      // context.setTrustedCertificates('assets/certificates/sajuring.pem');
      return context;
    }
    return null;
  }
  
  // HTTP 클라이언트 설정
  static HttpClient createHttpClient() {
    final client = HttpClient();
    
    if (ApiConfig.isProduction) {
      // 프로덕션에서 SSL 검증 강화
      client.badCertificateCallback = (cert, host, port) => false;
    }
    
    return client;
  }
}
```

### 2. 데이터 암호화
```dart
// lib/services/encryption_service.dart
import 'dart:convert';
import 'package:crypto/crypto.dart';

class EncryptionService {
  // 민감한 데이터 해싱
  static String hashData(String data) {
    final bytes = utf8.encode(data);
    final digest = sha256.convert(bytes);
    return digest.toString();
  }
  
  // 간단한 XOR 암호화 (로컬 저장용)
  static String simpleEncrypt(String data, String key) {
    final dataBytes = utf8.encode(data);
    final keyBytes = utf8.encode(key);
    final encrypted = <int>[];
    
    for (int i = 0; i < dataBytes.length; i++) {
      encrypted.add(dataBytes[i] ^ keyBytes[i % keyBytes.length]);
    }
    
    return base64.encode(encrypted);
  }
  
  static String simpleDecrypt(String encryptedData, String key) {
    final encryptedBytes = base64.decode(encryptedData);
    final keyBytes = utf8.encode(key);
    final decrypted = <int>[];
    
    for (int i = 0; i < encryptedBytes.length; i++) {
      decrypted.add(encryptedBytes[i] ^ keyBytes[i % keyBytes.length]);
    }
    
    return utf8.decode(decrypted);
  }
}
```

## 📱 플랫폼별 설정

### 1. Android 설정
```xml
<!-- android/app/src/main/AndroidManifest.xml -->
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <!-- 네트워크 권한 -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    
    <application
        android:label="사주링"
        android:name="${applicationName}"
        android:icon="@mipmap/ic_launcher"
        android:usesCleartextTraffic="true"> <!-- 개발시에만 true -->
        
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:launchMode="singleTop"
            android:theme="@style/LaunchTheme"
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|smallestScreenSize|locale|layoutDirection|fontScale|screenLayout|density|uiMode"
            android:hardwareAccelerated="true"
            android:windowSoftInputMode="adjustResize">
            
            <meta-data
              android:name="io.flutter.embedding.android.NormalTheme"
              android:resource="@style/NormalTheme" />
              
            <intent-filter android:autoVerify="true">
                <action android:name="android.intent.action.MAIN"/>
                <category android:name="android.intent.category.LAUNCHER"/>
            </intent-filter>
        </activity>
        
        <meta-data
            android:name="flutterEmbedding"
            android:value="2" />
    </application>
</manifest>
```

### 2. iOS 설정
```xml
<!-- ios/Runner/Info.plist -->
<dict>
    <!-- 네트워크 보안 설정 -->
    <key>NSAppTransportSecurity</key>
    <dict>
        <key>NSAllowsArbitraryLoads</key>
        <false/>
        <key>NSExceptionDomains</key>
        <dict>
            <!-- 개발 서버용 (개발시에만) -->
            <key>1.234.2.37</key>
            <dict>
                <key>NSExceptionAllowsInsecureHTTPLoads</key>
                <true/>
                <key>NSExceptionMinimumTLSVersion</key>
                <string>TLSv1.0</string>
            </dict>
        </dict>
    </dict>
    
    <!-- 앱 정보 -->
    <key>CFBundleName</key>
    <string>사주링</string>
    <key>CFBundleDisplayName</key>
    <string>사주링</string>
</dict>
```

## 🧪 테스트 코드

### 1. 유닛 테스트
```dart
// test/services/auth_service_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:sajuring_app/services/auth_service.dart';
import 'package:sajuring_app/services/api_service.dart';

void main() {
  group('AuthService Tests', () {
    setUpAll(() async {
      await ApiService.initialize();
    });

    test('should login with valid credentials', () async {
      final response = await AuthService.login(
        loginId: 'testuser',
        password: 'testpassword',
      );
      
      expect(response.success, isTrue);
      expect(response.data?['token'], isNotNull);
    });

    test('should fail with invalid credentials', () async {
      final response = await AuthService.login(
        loginId: 'invalid',
        password: 'invalid',
      );
      
      expect(response.success, isFalse);
      expect(response.error, isNotNull);
    });
  });
}
```

## 🚀 빌드 및 배포

### 1. 개발 빌드
```bash
# 개발 모드 실행
flutter run --debug

# 특정 환경으로 실행
flutter run --dart-define=ENVIRONMENT=development
```

### 2. 프로덕션 빌드
```bash
# Android APK 빌드
flutter build apk --release --dart-define=ENVIRONMENT=production

# Android App Bundle 빌드
flutter build appbundle --release --dart-define=ENVIRONMENT=production

# iOS 빌드
flutter build ios --release --dart-define=ENVIRONMENT=production
```

### 3. 환경별 설정
```dart
// lib/config/environment.dart
class Environment {
  static const String environment = String.fromEnvironment(
    'ENVIRONMENT',
    defaultValue: 'development',
  );
  
  static bool get isDevelopment => environment == 'development';
  static bool get isProduction => environment == 'production';
  
  static String get apiBaseUrl {
    switch (environment) {
      case 'production':
        return 'https://api.sajuring.co.kr/api';
      case 'development':
      default:
        return 'http://1.234.2.37:3013/api';
    }
  }
}
```

## 📊 성능 최적화

### 1. 이미지 캐싱
```dart
// lib/widgets/cached_image.dart
import 'package:cached_network_image/cached_network_image.dart';

class CachedImage extends StatelessWidget {
  final String imageUrl;
  final double? width;
  final double? height;
  final BoxFit fit;

  const CachedImage({
    Key? key,
    required this.imageUrl,
    this.width,
    this.height,
    this.fit = BoxFit.cover,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return CachedNetworkImage(
      imageUrl: imageUrl,
      width: width,
      height: height,
      fit: fit,
      placeholder: (context, url) => LoadingWidget(),
      errorWidget: (context, url, error) => Icon(Icons.error),
      memCacheWidth: width?.toInt(),
      memCacheHeight: height?.toInt(),
    );
  }
}
```

### 2. API 응답 캐싱
```dart
// lib/services/cache_service.dart
import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

class CacheService {
  static const Duration _defaultCacheDuration = Duration(minutes: 5);
  
  static Future<void> setCache(String key, dynamic data, {Duration? duration}) async {
    final prefs = await SharedPreferences.getInstance();
    final expiry = DateTime.now().add(duration ?? _defaultCacheDuration);
    
    final cacheData = {
      'data': data,
      'expiry': expiry.millisecondsSinceEpoch,
    };
    
    await prefs.setString(key, jsonEncode(cacheData));
  }
  
  static Future<T?> getCache<T>(String key) async {
    final prefs = await SharedPreferences.getInstance();
    final cacheString = prefs.getString(key);
    
    if (cacheString == null) return null;
    
    final cacheData = jsonDecode(cacheString);
    final expiry = DateTime.fromMillisecondsSinceEpoch(cacheData['expiry']);
    
    if (DateTime.now().isAfter(expiry)) {
      await prefs.remove(key);
      return null;
    }
    
    return cacheData['data'] as T;
  }
  
  static Future<void> clearCache() async {
    final prefs = await SharedPreferences.getInstance();
    final keys = prefs.getKeys().where((key) => key.startsWith('cache_'));
    for (final key in keys) {
      await prefs.remove(key);
    }
  }
}
```

이제 Flutter 앱에서 배포된 사주링 API를 완벽하게 활용할 수 있는 개발 환경이 준비되었습니다! 🎯✨