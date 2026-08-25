import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

enum VeyraApiErrorKind { configuration, dns, network, timeout, authentication, payment, provider, backend, http, invalidResponse }

class VeyraApiException implements Exception {
  const VeyraApiException(this.kind, this.message, {this.statusCode, this.code, this.endpoint});
  final VeyraApiErrorKind kind;
  final String message;
  final int? statusCode;
  final String? code;
  final String? endpoint;
  String get label => kind.name;
  @override String toString() => '$label${statusCode == null ? '' : ' (HTTP $statusCode)'}: $message';
}

class VeyraApi {
  VeyraApi({http.Client? client, String? token}) : _client = client ?? http.Client(), _token = token;
  final http.Client _client;
  String? _token;

  static const String baseUrl = String.fromEnvironment('VEYRA_API_BASE_URL', defaultValue: 'https://veyra-ai-sigma.vercel.app');
  bool get configured => baseUrl.trim().isNotEmpty;
  String? get token => _token;
  void setToken(String? token) => _token = token;

  Map<String,String> _headers({bool json=false}) => {if(json) 'content-type':'application/json', if(_token?.isNotEmpty == true) 'authorization':'Bearer $_token'};
  Uri _uri(String path) => Uri.parse('$baseUrl$path');

  Future<http.Response> _request(String path, Future<http.Response> Function(Uri) send, {Duration timeout=const Duration(seconds:30)}) async {
    try { return await send(_uri(path)).timeout(timeout); }
    on TimeoutException { throw VeyraApiException(VeyraApiErrorKind.timeout, 'Sunucu zaman aşımına uğradı.', endpoint:path); }
    catch(e) { if(e is VeyraApiException) rethrow; throw VeyraApiException(VeyraApiErrorKind.network, e.toString(), endpoint:path); }
  }

  Future<Map<String,dynamic>> _json(http.Response response, {int? expected, String? endpoint}) async {
    Map<String,dynamic> body={};
    if(response.body.isNotEmpty) {
      try { final d=jsonDecode(response.body); body=d is Map<String,dynamic> ? d : {'data':d}; }
      catch(_) { throw VeyraApiException(VeyraApiErrorKind.invalidResponse,'Geçersiz sunucu yanıtı.',statusCode:response.statusCode,endpoint:endpoint); }
    }
    if((expected != null && response.statusCode != expected) || (expected == null && response.statusCode >= 400)) {
      throw VeyraApiException(response.statusCode == 401 || response.statusCode == 403 ? VeyraApiErrorKind.authentication : response.statusCode == 402 ? VeyraApiErrorKind.payment : response.statusCode >= 500 ? VeyraApiErrorKind.backend : VeyraApiErrorKind.http, '${body['detail'] ?? body['message'] ?? body['error'] ?? 'İstek başarısız'}', statusCode:response.statusCode, endpoint:endpoint);
    }
    return body;
  }

  Future<bool> health() async { try { final r=await _request('/health',(u)=>_client.get(u,headers:_headers()),timeout:const Duration(seconds:12)); return r.statusCode==200; } catch(_){ return true; } }

  Future<Map<String,dynamic>> anonymousAuth(String deviceKey) async {
    const path='/v1/auth/anonymous';
    final body=await _json(await _request(path,(u)=>_client.post(u,headers:_headers(json:true),body:jsonEncode({'deviceKey':deviceKey})),timeout:const Duration(seconds:45)),expected:201,endpoint:path);
    final t=body['token']; if(t is String && t.isNotEmpty) _token=t; return body;
  }

  Future<Map<String,dynamic>> wallet(String userId) async { final p='/v1/users/$userId/wallet'; return _json(await _request(p,(u)=>_client.get(u,headers:_headers())),expected:200,endpoint:p); }
  Future<int> walletCredits(String userId) async => ((await wallet(userId))['credits'] as num).toInt();
  Future<List<Map<String,dynamic>>> walletLedger(String userId) async { final p='/v1/users/$userId/wallet/ledger'; final b=await _json(await _request(p,(u)=>_client.get(u,headers:_headers())),expected:200,endpoint:p); return (b['items'] as List? ?? const []).map((e)=>Map<String,dynamic>.from(e as Map)).toList(); }
  Future<Map<String,dynamic>> storeProducts() async { const p='/v1/store/products'; return _json(await _request(p,(u)=>_client.get(u,headers:_headers())),expected:200,endpoint:p); }
  Future<List<Map<String,dynamic>>> purchases(String userId) async { final p='/v1/users/$userId/purchases'; final b=await _json(await _request(p,(u)=>_client.get(u,headers:_headers())),expected:200,endpoint:p); return (b['items'] as List? ?? const []).map((e)=>Map<String,dynamic>.from(e as Map)).toList(); }

  Future<Map<String,dynamic>> verifyPurchase({required String userId,required String platform,required String productId,required String transactionId,required String purchaseToken}) async { const p='/v1/purchases/verify'; return _json(await _request(p,(u)=>_client.post(u,headers:_headers(json:true),body:jsonEncode({'userId':userId,'platform':platform,'productId':productId,'transactionId':transactionId,'purchaseToken':purchaseToken}))),endpoint:p); }

  Future<List<Map<String,dynamic>>> userGenerations(String userId) async { final p='/v1/users/$userId/generations'; final b=await _json(await _request(p,(u)=>_client.get(u,headers:_headers())),expected:200,endpoint:p); return (b['items'] as List? ?? const []).map((e)=>Map<String,dynamic>.from(e as Map)).toList(); }

  Future<int> quote({required String type,int seconds=0,String quality='fast',bool audio=false,bool draft=false}) async { const p='/v1/quote'; final b=await _json(await _request(p,(u)=>_client.post(u,headers:_headers(json:true),body:jsonEncode({'type':type,'seconds':seconds,'quality':quality,'audio':audio,'draft':draft})),timeout:const Duration(seconds:45)),expected:200,endpoint:p); return (b['credits'] as num).toInt(); }

  Future<Map<String,dynamic>> createGeneration({required String userId,required String type,required String prompt,int seconds=0,String quality='fast',bool audio=false,String aspectRatio='9:16',bool draft=false,List<String> references=const [],bool brandKit=false,bool captions=false}) async {
    const p='/v1/generations';
    return _json(await _request(p,(u)=>_client.post(u,headers:_headers(json:true),body:jsonEncode({'userId':userId,'type':type,'prompt':prompt,'seconds':seconds,'quality':quality,'audio':audio,'aspectRatio':aspectRatio,'draft':draft,'references':references,if(references.isNotEmpty) 'imageUrl':references.first,'brandKit':brandKit,'captions':captions})),timeout:const Duration(seconds:60)),expected:202,endpoint:p);
  }

  Future<Map<String,dynamic>> generation(String id) async { final p='/v1/generations/$id'; return _json(await _request(p,(u)=>_client.get(u,headers:_headers())),expected:200,endpoint:p); }
  Future<Map<String,dynamic>> reportGeneration({required String id,required String userId,required String reason,String details=''}) async { final p='/v1/generations/$id/report'; return _json(await _request(p,(u)=>_client.post(u,headers:_headers(json:true),body:jsonEncode({'userId':userId,'reason':reason,'details':details}))),expected:201,endpoint:p); }
  Future<Map<String,dynamic>> copilotPlan({required String userId,required String message,String? projectId}) async { const p='/v1/copilot/plan'; return _json(await _request(p,(u)=>_client.post(u,headers:_headers(json:true),body:jsonEncode({'userId':userId,'message':message,if(projectId!=null)'projectId':projectId}))),expected:200,endpoint:p); }
  Future<Map<String,dynamic>> brandKit(String userId) async { final p='/v1/business/$userId/brand-kit'; return _json(await _request(p,(u)=>_client.get(u,headers:_headers())),expected:200,endpoint:p); }
  Future<Map<String,dynamic>> saveBrandKit({required String userId,required String name,required List<String> colors,String slogan=''}) async { final p='/v1/business/$userId/brand-kit'; return _json(await _request(p,(u)=>_client.put(u,headers:_headers(json:true),body:jsonEncode({'name':name,'colors':colors,'slogan':slogan}))),expected:200,endpoint:p); }
  Future<Map<String,dynamic>> createBatch({required String userId,required int count,required String operation}) async { const p='/v1/business/batch'; return _json(await _request(p,(u)=>_client.post(u,headers:_headers(json:true),body:jsonEncode({'userId':userId,'count':count,'operation':operation}))),expected:202,endpoint:p); }
  Future<Map<String,dynamic>> deleteAccount(String userId) async { final p='/v1/users/$userId'; return _json(await _request(p,(u)=>_client.delete(u,headers:_headers())),expected:202,endpoint:p); }
  void close()=>_client.close();
}
