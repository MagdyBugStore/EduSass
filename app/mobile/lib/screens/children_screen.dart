import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api.dart';
import '../core/auth.dart';
import '../widgets/common.dart';
import 'child_screen.dart';
import 'notifications_screen.dart';

class ChildrenScreen extends StatelessWidget {
  const ChildrenScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthState>();
    return Scaffold(
      appBar: AppBar(
        title: Text(auth.schoolName.isEmpty ? 'أبنائي' : auth.schoolName),
        actions: [
          IconButton(icon: const Icon(Icons.notifications), tooltip: 'الإشعارات', onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const NotificationsScreen()))),
          IconButton(
            icon: const Icon(Icons.logout), tooltip: 'خروج',
            onPressed: () async {
              final ok = await showDialog<bool>(
                context: context,
                builder: (c) => AlertDialog(title: const Text('تسجيل الخروج؟'), actions: [
                  TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('إلغاء')),
                  FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('خروج')),
                ]),
              );
              if (ok == true) auth.logout();
            },
          ),
        ],
      ),
      body: Async<List<dynamic>>(
        load: () => Api.I.get<List<dynamic>>('/parent/children'),
        builder: (c, kids) {
          if (kids.isEmpty) return const EmptyText('لا يوجد أبناء مرتبطون بحسابك');
          return ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: kids.length,
            separatorBuilder: (_, _) => const SizedBox(height: 10),
            itemBuilder: (c, i) {
              final k = kids[i] as Map<String, dynamic>;
              final cls = k['classId'] as Map<String, dynamic>?;
              final due = (k['due'] as num?) ?? 0;
              return Card(
                child: ListTile(
                  contentPadding: const EdgeInsets.all(14),
                  leading: CircleAvatar(radius: 26, child: Text((k['name'] as String).characters.first)),
                  title: Text(k['name'], style: const TextStyle(fontWeight: FontWeight.bold)),
                  subtitle: Text(cls == null ? 'بدون فصل' : '${cls['name']} ${cls['section'] ?? ''} — ${cls['stage']}'),
                  trailing: due > 0 ? Chip(label: Text('مستحق ${money(due)}', style: const TextStyle(fontSize: 11)), backgroundColor: Colors.orange.shade50) : const Icon(Icons.chevron_left),
                  onTap: () => Navigator.push(c, MaterialPageRoute(builder: (_) => ChildScreen(id: k['_id'], name: k['name']))),
                ),
              );
            },
          );
        },
      ),
    );
  }
}
