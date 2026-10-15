import 'package:flutter/material.dart';

import '../core/api.dart';
import '../widgets/common.dart';

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});
  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  Key _k = UniqueKey();

  IconData _icon(String? t) => switch (t) {
        'absence' => Icons.person_off,
        'fee' => Icons.payments,
        'exam' => Icons.grading,
        'announcement' => Icons.campaign,
        _ => Icons.notifications,
      };

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('الإشعارات'), actions: [
        TextButton(
          onPressed: () async {
            await Api.I.post('/parent/notifications/read-all');
            setState(() => _k = UniqueKey());
          },
          child: const Text('قراءة الكل', style: TextStyle(color: Colors.white)),
        ),
      ]),
      body: Async<List<dynamic>>(
        key: _k,
        load: () => Api.I.get('/parent/notifications'),
        builder: (c, rows) {
          if (rows.isEmpty) return const EmptyText('لا توجد إشعارات');
          return ListView.separated(
            itemCount: rows.length,
            separatorBuilder: (_, _) => const Divider(height: 1),
            itemBuilder: (c, i) {
              final n = rows[i] as Map;
              final unread = n['readAt'] == null;
              return ListTile(
                tileColor: unread ? const Color(0xFFE8EEFB) : null,
                leading: Icon(_icon(n['type']), color: const Color(0xFF1C3F94)),
                title: Text(n['title'] ?? '', style: TextStyle(fontWeight: unread ? FontWeight.bold : FontWeight.normal)),
                subtitle: Text('${n['body'] ?? ''}\n${dateAr(n['createdAt'])}'),
                isThreeLine: true,
                onTap: unread ? () async {
                  await Api.I.post('/parent/notifications/${n['_id']}/read');
                  setState(() => _k = UniqueKey());
                } : null,
              );
            },
          );
        },
      ),
    );
  }
}
