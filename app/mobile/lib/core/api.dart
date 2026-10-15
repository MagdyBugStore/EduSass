import 'package:dio/dio.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Override at build time: flutter build apk --dart-define=API_URL=https://api.example.com/api
const apiUrl = String.fromEnvironment('API_URL', defaultValue: 'http://10.0.2.2:4000/api');

class ApiException implements Exception {
  final String message;
  final int? status;
  ApiException(this.message, [this.status]);
  @override
  String toString() => message;
}

class Api {
  Api._() {
    dio = Dio(BaseOptions(
      baseUrl: apiUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 20),
    ));
    dio.interceptors.add(InterceptorsWrapper(
      onRequest: (o, h) {
        if (token != null) o.headers['Authorization'] = 'Bearer $token';
        h.next(o);
      },
      onError: (e, h) {
        if (e.response?.statusCode == 401 && token != null) onUnauthorized?.call();
        h.next(e);
      },
    ));
  }
  static final Api I = Api._();

  late final Dio dio;
  String? token;
  void Function()? onUnauthorized;

  Future<void> loadToken() async {
    token = (await SharedPreferences.getInstance()).getString('token');
  }

  Future<void> saveToken(String? t) async {
    token = t;
    final p = await SharedPreferences.getInstance();
    t == null ? await p.remove('token') : await p.setString('token', t);
  }

  Future<T> get<T>(String path, {Map<String, dynamic>? query}) => _run(() => dio.get(path, queryParameters: query));
  Future<T> post<T>(String path, [Object? body]) => _run(() => dio.post(path, data: body));

  Future<T> _run<T>(Future<Response> Function() f) async {
    try {
      return (await f()).data as T;
    } on DioException catch (e) {
      final msg = e.response?.data is Map ? e.response!.data['message'] as String? : null;
      throw ApiException(
        msg ?? (e.type == DioExceptionType.connectionError || e.type == DioExceptionType.connectionTimeout ? 'تعذر الاتصال بالخادم' : 'حدث خطأ'),
        e.response?.statusCode,
      );
    }
  }
}
