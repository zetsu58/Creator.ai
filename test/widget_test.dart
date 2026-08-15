import 'package:creator_ai/main.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('CreatorAI launches to Studio', (tester) async {
    await tester.pumpWidget(const CreatorAIApp());
    expect(find.text('CreatorAI'), findsOneWidget);
    expect(find.text('AI Video Studio'), findsOneWidget);
  });
}
