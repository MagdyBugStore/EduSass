import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'core/auth.dart';
import 'screens/children_screen.dart';
import 'screens/login_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(ChangeNotifierProvider(create: (_) => AuthState()..init(), child: const ParentApp()));
}

class ParentApp extends StatelessWidget {
  const ParentApp({super.key});

  @override
  Widget build(BuildContext context) {
    const brand = Color(0xFF1C3F94);
    return MaterialApp(
      title: 'متابعة الطالب',
      debugShowCheckedModeBanner: false,
      locale: const Locale('ar'),
      supportedLocales: const [Locale('ar')],
      localizationsDelegates: const [
        DefaultMaterialLocalizations.delegate,
        DefaultWidgetsLocalizations.delegate,
      ],
      builder: (c, child) => Directionality(textDirection: TextDirection.rtl, child: child!),
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(seedColor: brand),
        scaffoldBackgroundColor: const Color(0xFFF5F7FA),
        appBarTheme: const AppBarTheme(backgroundColor: brand, foregroundColor: Colors.white),
        cardTheme: CardThemeData(elevation: 0, margin: const EdgeInsets.only(bottom: 8), color: Colors.white, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(3), side: const BorderSide(color: Color(0xFFC9D6EA)))),
        tabBarTheme: const TabBarThemeData(indicatorColor: Color(0xFFFFE14D)),
        filledButtonTheme: FilledButtonThemeData(style: FilledButton.styleFrom(shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)))),
        inputDecorationTheme: InputDecorationTheme(border: OutlineInputBorder(borderRadius: BorderRadius.circular(4))),
      ),
      home: Consumer<AuthState>(
        builder: (_, a, _) => a.loading
            ? const Scaffold(body: Center(child: CircularProgressIndicator()))
            : a.loggedIn
                ? const ChildrenScreen()
                : const LoginScreen(),
      ),
    );
  }
}
