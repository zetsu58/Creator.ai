import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';
import 'package:google_sign_in/google_sign_in.dart';

class VeyraAuth {
  VeyraAuth._();
  static final VeyraAuth instance = VeyraAuth._();

  static const bool firebaseEnabled = bool.fromEnvironment('VEYRA_FIREBASE_ENABLED', defaultValue: false);
  bool _ready = false;

  bool get ready => _ready;
  User? get currentUser => _ready ? FirebaseAuth.instance.currentUser : null;

  Future<bool> initialize() async {
    if (!firebaseEnabled) return false;
    try {
      if (Firebase.apps.isEmpty) await Firebase.initializeApp();
      _ready = true;
      return true;
    } catch (_) {
      _ready = false;
      return false;
    }
  }

  Future<UserCredential> signUpWithEmail(String email, String password) async {
    _requireReady();
    return FirebaseAuth.instance.createUserWithEmailAndPassword(email: email.trim(), password: password);
  }

  Future<UserCredential> signInWithEmail(String email, String password) async {
    _requireReady();
    return FirebaseAuth.instance.signInWithEmailAndPassword(email: email.trim(), password: password);
  }

  Future<void> resetPassword(String email) async {
    _requireReady();
    await FirebaseAuth.instance.sendPasswordResetEmail(email: email.trim());
  }

  Future<UserCredential> signInWithGoogle() async {
    _requireReady();
    if (kIsWeb) {
      return FirebaseAuth.instance.signInWithPopup(GoogleAuthProvider());
    }
    await GoogleSignIn.instance.initialize();
    final account = await GoogleSignIn.instance.authenticate();
    final auth = account.authentication;
    final credential = GoogleAuthProvider.credential(idToken: auth.idToken);
    return FirebaseAuth.instance.signInWithCredential(credential);
  }

  Future<UserCredential> signInWithApple() async {
    _requireReady();
    final provider = AppleAuthProvider();
    if (kIsWeb) return FirebaseAuth.instance.signInWithPopup(provider);
    return FirebaseAuth.instance.signInWithProvider(provider);
  }

  Future<void> signOut() async {
    if (!_ready) return;
    await FirebaseAuth.instance.signOut();
    try {
      await GoogleSignIn.instance.signOut();
    } catch (_) {}
  }

  void _requireReady() {
    if (!_ready) throw StateError('Firebase Authentication yapılandırılmadı');
  }
}
