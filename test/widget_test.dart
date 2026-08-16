import 'package:creator_ai/main.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('Veyra AI smoke test', (tester) async {
    await tester.pumpWidget(const CreatorAIApp());
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('veyra_app')), findsOneWidget);
    expect(find.byType(MaterialApp), findsOneWidget);
    expect(find.byType(CreatorHome), findsOneWidget);
  });
}
