import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/auth.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _login = TextEditingController();
  final _pass = TextEditingController();
  bool _busy = false, _hide = true;
  String? _error;

  Future<void> _submit() async {
    if (_login.text.trim().isEmpty || _pass.text.isEmpty) return;
    setState(() { _busy = true; _error = null; });
    try {
      await context.read<AuthState>().login(_login.text, _pass.text);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 400),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                const Icon(Icons.school, size: 64, color: Color(0xFF1C3F94)),
                const SizedBox(height: 12),
                const Text('متابعة الطالب', textAlign: TextAlign.center, style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
                const SizedBox(height: 4),
                const Text('سجّل الدخول برقم الهاتف الذي سلّمته المدرسة', textAlign: TextAlign.center, style: TextStyle(color: Colors.grey)),
                const SizedBox(height: 28),
                TextField(controller: _login, keyboardType: TextInputType.phone, textDirection: TextDirection.ltr, decoration: const InputDecoration(labelText: 'رقم الهاتف', prefixIcon: Icon(Icons.phone))),
                const SizedBox(height: 12),
                TextField(
                  controller: _pass, obscureText: _hide, onSubmitted: (_) => _submit(),
                  decoration: InputDecoration(labelText: 'كلمة المرور', prefixIcon: const Icon(Icons.lock), suffixIcon: IconButton(icon: Icon(_hide ? Icons.visibility : Icons.visibility_off), onPressed: () => setState(() => _hide = !_hide))),
                ),
                if (_error != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(_error!, style: const TextStyle(color: Colors.red), textAlign: TextAlign.center)),
                const SizedBox(height: 20),
                FilledButton(
                  onPressed: _busy ? null : _submit,
                  style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14)),
                  child: _busy ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Text('دخول'),
                ),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}
