import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/auth/veyra_auth.dart';
import '../core/design/creator_theme.dart';

class VeyraEntryGate extends StatefulWidget {
  const VeyraEntryGate({super.key, required this.homeBuilder});
  final WidgetBuilder homeBuilder;

  @override
  State<VeyraEntryGate> createState() => _VeyraEntryGateState();
}

class _VeyraEntryGateState extends State<VeyraEntryGate> {
  bool loading = true;
  bool onboardingDone = false;
  bool authenticated = false;
  bool firebaseReady = false;

  @override
  void initState() {
    super.initState();
    _boot();
  }

  Future<void> _boot() async {
    final prefs = await SharedPreferences.getInstance();
    final ready = await VeyraAuth.instance.initialize();
    if (!mounted) return;
    setState(() {
      onboardingDone = prefs.getBool('veyra_onboarding_done') ?? false;
      firebaseReady = ready;
      authenticated = ready && VeyraAuth.instance.currentUser != null;
      loading = false;
    });
  }

  Future<void> _finishOnboarding() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('veyra_onboarding_done', true);
    if (mounted) setState(() => onboardingDone = true);
  }

  void _signedIn() => setState(() => authenticated = true);
  void _guest() => setState(() => authenticated = true);

  @override
  Widget build(BuildContext context) {
    if (loading) return const VeyraLaunchScreen();
    if (!onboardingDone) return VeyraOnboarding(onDone: _finishOnboarding);
    if (!authenticated) {
      return VeyraAuthScreen(
        firebaseReady: firebaseReady,
        onSignedIn: _signedIn,
        onGuest: _guest,
      );
    }
    return widget.homeBuilder(context);
  }
}

class VeyraLaunchScreen extends StatefulWidget {
  const VeyraLaunchScreen({super.key});
  @override
  State<VeyraLaunchScreen> createState() => _VeyraLaunchScreenState();
}

class _VeyraLaunchScreenState extends State<VeyraLaunchScreen> with SingleTickerProviderStateMixin {
  late final AnimationController controller = AnimationController(vsync: this, duration: const Duration(milliseconds: 1800))..repeat();
  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: Container(
      decoration: const BoxDecoration(gradient: RadialGradient(center: Alignment(0, -.15), radius: 1.1, colors: [Color(0xFF24114A), Color(0xFF090B12), Color(0xFF06070B)])),
      child: Center(
        child: AnimatedBuilder(
          animation: controller,
          builder: (_, __) => Transform.scale(
            scale: 1 + math.sin(controller.value * math.pi * 2) * .045,
            child: const _VeyraLogoHero(compact: true),
          ),
        ),
      ),
    ),
  );
}

class VeyraOnboarding extends StatefulWidget {
  const VeyraOnboarding({super.key, required this.onDone});
  final Future<void> Function() onDone;
  @override
  State<VeyraOnboarding> createState() => _VeyraOnboardingState();
}

class _VeyraOnboardingState extends State<VeyraOnboarding> with SingleTickerProviderStateMixin {
  final pageController = PageController();
  int page = 0;
  late final AnimationController glow = AnimationController(vsync: this, duration: const Duration(milliseconds: 2400))..repeat(reverse: true);

  static const pages = [
    ('Hayal et. Veyra üretsin.', 'Metinden görsel, video ve reklam üret. Fikrini saniyeler içinde profesyonel içeriğe dönüştür.', Icons.auto_awesome_rounded),
    ('Tek stüdyoda her şey.', 'Video Studio, Image Studio, ürün reklamları, düzenleme, geliştirme ve sosyal medya içerikleri tek yerde.', Icons.dashboard_customize_rounded),
    ('Markanı daha hızlı büyüt.', 'Boyutlandır, varyasyon üret, projelerini bulutta sakla ve hazır olduğunda paylaş.', Icons.rocket_launch_rounded),
  ];

  @override
  void dispose() {
    pageController.dispose();
    glow.dispose();
    super.dispose();
  }

  Future<void> _next() async {
    if (page == pages.length - 1) return widget.onDone();
    await pageController.nextPage(duration: const Duration(milliseconds: 420), curve: Curves.easeOutCubic);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: Container(
      decoration: const BoxDecoration(gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Color(0xFF11082B), Color(0xFF080A11), Color(0xFF080A11)])),
      child: SafeArea(
        child: Column(children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
            child: Row(children: [
              const Text('VEYRA AI', style: TextStyle(fontWeight: FontWeight.w900, letterSpacing: 1.4)),
              const Spacer(),
              TextButton(onPressed: widget.onDone, child: const Text('Atla')),
            ]),
          ),
          Expanded(
            child: PageView.builder(
              controller: pageController,
              itemCount: pages.length,
              onPageChanged: (value) => setState(() => page = value),
              itemBuilder: (context, index) {
                final item = pages[index];
                return Padding(
                  padding: const EdgeInsets.fromLTRB(26, 14, 26, 10),
                  child: Column(children: [
                    const Spacer(),
                    AnimatedBuilder(
                      animation: glow,
                      builder: (_, __) => Container(
                        width: 220,
                        height: 220,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          gradient: RadialGradient(colors: [const Color(0xFF8B5CF6).withValues(alpha: .34 + glow.value * .12), const Color(0xFF55D6FF).withValues(alpha: .10), Colors.transparent]),
                        ),
                        child: Center(
                          child: Container(
                            width: 118,
                            height: 118,
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(36),
                              gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFF6A3DFF), Color(0xFFD84EFF), Color(0xFF2BC7FF)]),
                              boxShadow: const [BoxShadow(color: Color(0x667B4DFF), blurRadius: 44, spreadRadius: 4)],
                            ),
                            child: Icon(item.$3, size: 54, color: Colors.white),
                          ),
                        ),
                      ),
                    ),
                    const Spacer(),
                    Text(item.$1, textAlign: TextAlign.center, style: const TextStyle(fontSize: 32, height: 1.05, fontWeight: FontWeight.w900)),
                    const SizedBox(height: 14),
                    Text(item.$2, textAlign: TextAlign.center, style: const TextStyle(fontSize: 16, height: 1.5, color: Colors.white60)),
                    const Spacer(),
                  ]),
                );
              },
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 8, 24, 26),
            child: Column(children: [
              Row(mainAxisAlignment: MainAxisAlignment.center, children: List.generate(pages.length, (i) => AnimatedContainer(duration: const Duration(milliseconds: 250), margin: const EdgeInsets.symmetric(horizontal: 4), width: i == page ? 26 : 7, height: 7, decoration: BoxDecoration(color: i == page ? CreatorTheme.cyan : Colors.white24, borderRadius: BorderRadius.circular(20))))),
              const SizedBox(height: 22),
              SizedBox(width: double.infinity, height: 58, child: FilledButton(onPressed: _next, child: Text(page == pages.length - 1 ? 'Veyra AI’ye Başla' : 'Devam Et'))),
            ]),
          ),
        ]),
      ),
    ),
  );
}

class VeyraAuthScreen extends StatefulWidget {
  const VeyraAuthScreen({super.key, required this.firebaseReady, required this.onSignedIn, required this.onGuest});
  final bool firebaseReady;
  final VoidCallback onSignedIn;
  final VoidCallback onGuest;

  @override
  State<VeyraAuthScreen> createState() => _VeyraAuthScreenState();
}

class _VeyraAuthScreenState extends State<VeyraAuthScreen> {
  final email = TextEditingController();
  final password = TextEditingController();
  bool register = false;
  bool busy = false;
  bool obscure = true;
  String? message;

  @override
  void dispose() {
    email.dispose();
    password.dispose();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() action) async {
    if (busy) return;
    setState(() { busy = true; message = null; });
    try {
      await action();
      if (mounted) widget.onSignedIn();
    } catch (e) {
      if (mounted) setState(() => message = _friendlyError(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  String _friendlyError(Object error) {
    final text = '$error';
    if (text.contains('Firebase Authentication yapılandırılmadı')) return 'Google/Apple ve e-posta girişi için Firebase bağlantısı henüz tamamlanmadı.';
    if (text.contains('invalid-credential')) return 'E-posta veya şifre hatalı.';
    if (text.contains('email-already-in-use')) return 'Bu e-posta ile zaten bir hesap var.';
    if (text.contains('weak-password')) return 'Daha güçlü bir şifre belirle.';
    return 'İşlem tamamlanamadı. Lütfen tekrar dene.';
  }

  Future<void> _emailSubmit() async {
    if (email.text.trim().isEmpty || password.text.length < 6) {
      setState(() => message = 'Geçerli bir e-posta ve en az 6 karakterlik şifre gir.');
      return;
    }
    await _run(() async {
      if (register) {
        await VeyraAuth.instance.signUpWithEmail(email.text, password.text);
      } else {
        await VeyraAuth.instance.signInWithEmail(email.text, password.text);
      }
    });
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: Container(
      decoration: const BoxDecoration(gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Color(0xFF150B31), Color(0xFF080A11), Color(0xFF080A11)])),
      child: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(22),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 520),
              child: Column(children: [
                const _VeyraLogoHero(),
                const SizedBox(height: 24),
                Text(register ? 'Veyra hesabını oluştur' : 'Veyra AI’ye hoş geldin', style: const TextStyle(fontSize: 27, fontWeight: FontWeight.w900), textAlign: TextAlign.center),
                const SizedBox(height: 8),
                Text(register ? 'Kredilerin, projelerin ve aboneliğin hesabına bağlı kalsın.' : 'Projelerine ve kredilerine devam etmek için giriş yap.', style: const TextStyle(color: Colors.white60), textAlign: TextAlign.center),
                const SizedBox(height: 24),
                if (!widget.firebaseReady)
                  Container(
                    padding: const EdgeInsets.all(13),
                    decoration: BoxDecoration(color: const Color(0x22FFB74D), borderRadius: BorderRadius.circular(18), border: Border.all(color: const Color(0x55FFB74D))),
                    child: const Row(children: [Icon(Icons.info_outline, color: Colors.orangeAccent), SizedBox(width: 10), Expanded(child: Text('Firebase bağlantısı test modunda kapalı. Misafir giriş çalışır; Google, Apple ve e-posta bağlantısı Firebase yapılandırması sonrası aktif olur.', style: TextStyle(fontSize: 12)))]),
                  ),
                const SizedBox(height: 14),
                TextField(controller: email, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(labelText: 'E-posta', prefixIcon: Icon(Icons.alternate_email))),
                const SizedBox(height: 12),
                TextField(controller: password, obscureText: obscure, decoration: InputDecoration(labelText: 'Şifre', prefixIcon: const Icon(Icons.lock_outline), suffixIcon: IconButton(onPressed: () => setState(() => obscure = !obscure), icon: Icon(obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined)))),
                const SizedBox(height: 14),
                SizedBox(width: double.infinity, height: 56, child: FilledButton(onPressed: busy ? null : _emailSubmit, child: Text(busy ? 'Bağlanıyor…' : register ? 'Hesap Oluştur' : 'Giriş Yap'))),
                if (!register)
                  Align(alignment: Alignment.centerRight, child: TextButton(onPressed: busy || email.text.trim().isEmpty ? null : () => _run(() async { await VeyraAuth.instance.resetPassword(email.text); }), child: const Text('Şifremi unuttum'))),
                const SizedBox(height: 10),
                const Row(children: [Expanded(child: Divider()), Padding(padding: EdgeInsets.symmetric(horizontal: 12), child: Text('veya', style: TextStyle(color: Colors.white38))), Expanded(child: Divider())]),
                const SizedBox(height: 14),
                _SocialButton(icon: Icons.g_mobiledata_rounded, text: 'Google ile devam et', onTap: busy ? null : () => _run(() async { await VeyraAuth.instance.signInWithGoogle(); })),
                const SizedBox(height: 10),
                _SocialButton(icon: Icons.apple, text: 'Apple ile devam et', onTap: busy ? null : () => _run(() async { await VeyraAuth.instance.signInWithApple(); })),
                const SizedBox(height: 16),
                TextButton(onPressed: busy ? null : () => setState(() { register = !register; message = null; }), child: Text(register ? 'Zaten hesabın var mı? Giriş yap' : 'Hesabın yok mu? Kayıt ol')),
                TextButton(onPressed: busy ? null : widget.onGuest, child: const Text('Şimdilik misafir devam et')),
                if (message != null) ...[
                  const SizedBox(height: 8),
                  Container(width: double.infinity, padding: const EdgeInsets.all(13), decoration: BoxDecoration(color: Colors.white.withValues(alpha: .05), borderRadius: BorderRadius.circular(16)), child: Text(message!, textAlign: TextAlign.center)),
                ],
                const SizedBox(height: 16),
                const Text('Devam ederek Kullanım Koşulları ve Gizlilik Politikası’nı kabul etmiş olursun.', textAlign: TextAlign.center, style: TextStyle(color: Colors.white38, fontSize: 11)),
              ]),
            ),
          ),
        ),
      ),
    ),
  );
}

class _SocialButton extends StatelessWidget {
  const _SocialButton({required this.icon, required this.text, required this.onTap});
  final IconData icon;
  final String text;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) => SizedBox(
    width: double.infinity,
    height: 54,
    child: OutlinedButton.icon(onPressed: onTap, icon: Icon(icon, size: 27), label: Text(text, style: const TextStyle(fontWeight: FontWeight.w800))),
  );
}

class _VeyraLogoHero extends StatelessWidget {
  const _VeyraLogoHero({this.compact = false});
  final bool compact;
  @override
  Widget build(BuildContext context) => Column(mainAxisSize: MainAxisSize.min, children: [
    Container(
      width: compact ? 92 : 82,
      height: compact ? 92 : 82,
      decoration: BoxDecoration(borderRadius: BorderRadius.circular(26), gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFF6B3CFF), Color(0xFFD849FF), Color(0xFF29C8FF)]), boxShadow: const [BoxShadow(color: Color(0x667A4CFF), blurRadius: 36)]),
      child: const Icon(Icons.auto_awesome, color: Colors.white, size: 40),
    ),
    const SizedBox(height: 13),
    Text('Veyra AI', style: TextStyle(fontSize: compact ? 31 : 25, fontWeight: FontWeight.w900, letterSpacing: -.5)),
    if (compact) const Padding(padding: EdgeInsets.only(top: 5), child: Text('Create. Imagine. Inspire.', style: TextStyle(color: Colors.white54, letterSpacing: .8))),
  ]);
}
