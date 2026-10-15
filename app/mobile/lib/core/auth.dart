import 'package:flutter/foundation.dart';
import 'api.dart';

class AuthState extends ChangeNotifier {
  Map<String, dynamic>? user;
  bool loading = true;

  bool get loggedIn => user != null;
  String get schoolName => (user?['school']?['name'] as String?) ?? '';

  Future<void> init() async {
    Api.I.onUnauthorized = () => logout();
    await Api.I.loadToken();
    if (Api.I.token != null) {
      try {
        user = await Api.I.get<Map<String, dynamic>>('/auth/me');
        if (user?['role'] != 'parent') await logout();
      } catch (_) {
        await Api.I.saveToken(null);
      }
    }
    loading = false;
    notifyListeners();
  }

  Future<void> login(String login, String password) async {
    final d = await Api.I.post<Map<String, dynamic>>('/auth/login', {'login': login.trim(), 'password': password});
    if (d['user']['role'] != 'parent') {
      throw ApiException('هذا التطبيق لأولياء الأمور فقط');
    }
    await Api.I.saveToken(d['token'] as String);
    user = d['user'] as Map<String, dynamic>;
    notifyListeners();
  }

  Future<void> logout() async {
    await Api.I.saveToken(null);
    user = null;
    notifyListeners();
  }
}
