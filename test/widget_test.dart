import 'package:creator_ai/main.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('Veyra AI launches and opens Video Studio', (tester) async {
    await tester.pumpWidget(const CreatorAIApp());
    await tester.pumpAndSettle();

    expect(find.byType(MaterialApp), findsOneWidget);
    expect(find.byType(CreatorHome), findsOneWidget);
    expect(find.text('Studio'), findsOneWidget);
    expect(find.text('Video'), findsOneWidget);

    await tester.tap(find.text('Video'));
    await tester.pumpAndSettle();

    expect(find.text('Video Studio'), findsOneWidget);
    expect(find.text('Smart'), findsOneWidget);
    expect(find.text('Director'), findsOneWidget);
  });
}
