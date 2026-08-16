import 'package:creator_ai/main_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  testWidgets('fresh install opens Veyra onboarding', (tester) async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    await tester.pumpWidget(const VeyraProductionApp());
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.byType(MaterialApp), findsOneWidget);
    expect(find.text('VEYRA AI'), findsOneWidget);
    expect(find.text('Hayal et. Veyra üretsin.'), findsOneWidget);
    expect(find.text('Atla'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('completed onboarding opens sign in and registration', (tester) async {
    SharedPreferences.setMockInitialValues(<String, Object>{'veyra_onboarding_done': true});
    await tester.pumpWidget(const VeyraProductionApp());
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('Veyra AI’ye hoş geldin'), findsOneWidget);
    expect(find.text('Google ile devam et'), findsOneWidget);
    expect(find.text('Apple ile devam et'), findsOneWidget);
    expect(find.text('Hesabın yok mu? Kayıt ol'), findsOneWidget);
    expect(find.text('Şimdilik misafir devam et'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
