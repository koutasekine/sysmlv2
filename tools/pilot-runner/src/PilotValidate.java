// パイロット実装(SysML-v2-Pilot-Implementation、タグ 2026-03)の検証の結果を書き出す照合用の実行器(GR5 指示書 4 章)。
// SPDX-License-Identifier: MIT
//
// 使い方:
//   java -cp <パイロット実装の成果物>:<このクラス> PilotValidate --out <出力先> --library <標準ライブラリのフォルダ>
//        [--base <基準のフォルダ>] <.sysml ファイル または ファイル一覧(@一覧.txt)>...
//
// 標準ライブラリの読み込みと、ファイルの扱いは PilotResolve と同じ(例題どうしの参照は解決しない)。
// ファイルごとに <出力先>/files/<基準からの相対パス>.json を書く。中身:
//   file        入力ファイル
//   issues      検証の結果(IResourceValidator、CheckMode.ALL)のうち、エラーと警告の全部。1 つの結果:
//     severity    "ERROR" か "WARNING"
//     code        検証の名前(issue code)。名前の参照の解決の失敗は org.eclipse.xtext.diagnostics.Diagnostic.Linking
//     message     メッセージ
//     offset, length, line, column  結果の原文の範囲(パイロット実装が示すもの)
//     object      結果の対象の要素: { type, implicit, offset, length, owner }。範囲は節点の範囲(節点がなければ最も近い祖先の
//                 節点で、implicit を true にする)。owner は、対象を含む最も近い型のメタクラス名。なければ null
//   unresolved  名前の参照の解決の失敗(原文に節点を持つ、所有でない参照で、解決先が得られないもの)。1 つの失敗:
//     offset, length, text  参照の節点の範囲と字句
//     source, feature, index  参照を持つ要素のメタクラス名、参照の属性名、一覧の属性なら何番目か
//     expected    参照の属性の型(期待される種類)
//     anyType     同じスコープを、種類を Element にして探し直した結果。null(見つからない)か { type, qname, local }
//                 (見つかれば、解決の失敗は種類が合わないことによる)
//   exception   例外が出たとき、その内容
// 全体の要約を <出力先>/summary.json に書く。

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import org.eclipse.emf.common.util.TreeIterator;
import org.eclipse.emf.common.util.URI;
import org.eclipse.emf.ecore.EObject;
import org.eclipse.emf.ecore.EPackage;
import org.eclipse.emf.ecore.EReference;
import org.eclipse.emf.ecore.resource.Resource;
import org.eclipse.emf.ecore.util.EcoreUtil;
import org.eclipse.xtext.linking.impl.LinkingHelper;
import org.eclipse.xtext.naming.IQualifiedNameConverter;
import org.eclipse.xtext.naming.QualifiedName;
import org.eclipse.xtext.nodemodel.INode;
import org.eclipse.xtext.nodemodel.util.NodeModelUtils;
import org.eclipse.xtext.resource.IEObjectDescription;
import org.eclipse.xtext.resource.IResourceServiceProvider;
import org.eclipse.xtext.resource.XtextResource;
import org.eclipse.xtext.resource.XtextResourceSet;
import org.eclipse.xtext.scoping.IScope;
import org.eclipse.xtext.scoping.IScopeProvider;
import org.eclipse.xtext.util.CancelIndicator;
import org.eclipse.xtext.validation.CheckMode;
import org.eclipse.xtext.validation.Issue;
import org.omg.kerml.xtext.KerMLStandaloneSetup;
import org.omg.sysml.lang.sysml.Element;
import org.omg.sysml.lang.sysml.SysMLPackage;
import org.omg.sysml.lang.sysml.Type;
import org.omg.sysml.xtext.SysMLStandaloneSetup;

import com.google.inject.Injector;

public class PilotValidate {

	// 種類を問わずに探し直すときに使う参照(型が Element の、所有でない参照)
	static final EReference ANY = SysMLPackage.eINSTANCE.getAnnotation_AnnotatedElement();

	public static void main(String[] args) throws Exception {
		Path out = null, base = null, library = null;
		List<Path> inputs = new ArrayList<>();
		for (int i = 0; i < args.length; i++) {
			if (args[i].equals("--out")) out = Paths.get(args[++i]);
			else if (args[i].equals("--base")) base = Paths.get(args[++i]).toAbsolutePath().normalize();
			else if (args[i].equals("--library")) library = Paths.get(args[++i]).toAbsolutePath().normalize();
			else if (args[i].startsWith("@")) {
				for (String line : Files.readAllLines(Paths.get(args[i].substring(1)), StandardCharsets.UTF_8)) {
					if (!line.isBlank()) inputs.add(Paths.get(line.trim()));
				}
			} else inputs.add(Paths.get(args[i]));
		}
		if (out == null || library == null || inputs.isEmpty()) {
			System.err.println("使い方: PilotValidate --out <出力先> --library <標準ライブラリ> [--base <基準>] <ファイル または @一覧>...");
			System.exit(2);
		}

		long t0 = System.nanoTime();
		// PilotRunner と同じ順で初期化する
		EPackage.Registry.INSTANCE.put(SysMLPackage.eNS_URI, SysMLPackage.eINSTANCE);
		KerMLStandaloneSetup.doSetup();
		Injector injector = new SysMLStandaloneSetup().createInjectorAndDoEMFRegistration();
		XtextResourceSet rs = injector.getInstance(XtextResourceSet.class);
		rs.getLoadOptions().put(XtextResource.OPTION_ENCODING, "UTF-8");

		// 標準ライブラリを読み込む
		Map<Path, Resource> libRes = new HashMap<>();
		List<Path> libFiles;
		try (Stream<Path> st = Files.walk(library)) {
			libFiles = st.filter(p -> p.toString().endsWith(".sysml") || p.toString().endsWith(".kerml")).sorted().toList();
		}
		for (Path p : libFiles) {
			Resource r = rs.getResource(URI.createFileURI(p.toString()), true);
			libRes.put(p.toAbsolutePath().normalize(), r);
		}
		long libMillis = (System.nanoTime() - t0) / 1_000_000;

		int done = 0, failed = 0, totalIssues = 0, totalUnresolved = 0;
		long t1 = System.nanoTime();
		for (Path in : inputs) {
			Path abs = in.toAbsolutePath().normalize();
			String rel = base != null && abs.startsWith(base) ? base.relativize(abs).toString() : abs.getFileName().toString();
			StringBuilder sb = new StringBuilder();
			sb.append("{\"file\":").append(str(rel));
			String exception = null;
			Resource res = libRes.get(abs);
			boolean temporary = res == null;
			try {
				if (temporary) res = rs.getResource(URI.createFileURI(abs.toString()), true);
				IResourceServiceProvider sp = ((XtextResource) res).getResourceServiceProvider();
				// 解決の失敗を先に調べる(検証より前に、すべての参照を解決させる)
				StringBuilder ub = new StringBuilder();
				int nu = unresolved(res, sp, ub);
				List<Issue> issues = sp.getResourceValidator().validate(res, CheckMode.ALL, CancelIndicator.NullImpl);
				sb.append(",\"issues\":[");
				int ni = 0;
				for (Issue is : issues) {
					String sev = is.getSeverity().name();
					if (!sev.equals("ERROR") && !sev.equals("WARNING")) continue;
					if (ni++ > 0) sb.append(',');
					sb.append("{\"severity\":").append(str(sev))
						.append(",\"code\":").append(is.getCode() == null ? "null" : str(is.getCode()))
						.append(",\"message\":").append(is.getMessage() == null ? "null" : str(is.getMessage()))
						.append(",\"offset\":").append(is.getOffset())
						.append(",\"length\":").append(is.getLength())
						.append(",\"line\":").append(is.getLineNumber())
						.append(",\"column\":").append(is.getColumn())
						.append(",\"object\":");
					EObject o = null;
					if (is.getUriToProblem() != null && is.getUriToProblem().fragment() != null) {
						try { o = res.getEObject(is.getUriToProblem().fragment()); } catch (RuntimeException e) { o = null; }
					}
					nodeOf(o, sb);
					sb.append('}');
				}
				sb.append(']');
				sb.append(",\"unresolved\":[").append(ub).append(']');
				totalIssues += ni;
				totalUnresolved += nu;
			} catch (Throwable e) {
				exception = e.toString();
				sb.append(",\"issues\":null,\"unresolved\":null");
			} finally {
				if (temporary && res != null) {
					res.unload();
					rs.getResources().remove(res);
				}
			}
			sb.append(",\"exception\":").append(exception == null ? "null" : str(exception));
			sb.append("}\n");
			Path dest = out.resolve("files").resolve(rel + ".json");
			Files.createDirectories(dest.getParent());
			Files.writeString(dest, sb.toString(), StandardCharsets.UTF_8);
			if (exception != null) failed++; else done++;
		}
		long millis = (System.nanoTime() - t1) / 1_000_000;
		String summary = "{\"files\":" + inputs.size() + ",\"done\":" + done + ",\"exceptions\":" + failed
			+ ",\"issues\":" + totalIssues + ",\"unresolved\":" + totalUnresolved + ",\"libraryFiles\":" + libFiles.size()
			+ ",\"libraryMillis\":" + libMillis + ",\"validateMillis\":" + millis + "}\n";
		Files.createDirectories(out);
		Files.writeString(out.resolve("summary.json"), summary, StandardCharsets.UTF_8);
		System.out.println("files=" + inputs.size() + " done=" + done + " exceptions=" + failed + " issues=" + totalIssues
			+ " unresolved=" + totalUnresolved + " libraryFiles=" + libFiles.size() + " libraryMillis=" + libMillis
			+ " validateMillis=" + millis);
	}

	// 解決できない参照を書き出す。書いた数を返す
	static int unresolved(Resource res, IResourceServiceProvider sp, StringBuilder sb) {
		IScopeProvider scopes = sp.get(IScopeProvider.class);
		LinkingHelper helper = sp.get(LinkingHelper.class);
		IQualifiedNameConverter qnc = sp.get(IQualifiedNameConverter.class);
		int n = 0;
		List<EObject> all = new ArrayList<>();
		for (TreeIterator<EObject> it = res.getAllContents(); it.hasNext(); ) all.add(it.next());
		for (EObject o : all) {
			for (EReference ref : o.eClass().getEAllReferences()) {
				if (ref.isContainment() || ref.isContainer()) continue;
				List<INode> nodes = NodeModelUtils.findNodesForFeature(o, ref);
				if (nodes.isEmpty()) continue;
				Object v = o.eGet(ref, true);
				List<?> values = ref.isMany() ? (List<?>) v : Collections.singletonList(v);
				for (int k = 0; k < nodes.size(); k++) {
					INode node = nodes.get(k);
					Object t = k < values.size() ? values.get(k) : null;
					if (t instanceof EObject && !((EObject) t).eIsProxy()) continue;
					if (n > 0) sb.append(',');
					n++;
					sb.append("{\"offset\":").append(node.getOffset())
						.append(",\"length\":").append(node.getLength())
						.append(",\"text\":").append(str(NodeModelUtils.getTokenText(node)))
						.append(",\"source\":").append(str(o.eClass().getName()))
						.append(",\"feature\":").append(str(ref.getName()))
						.append(",\"index\":").append(ref.isMany() ? String.valueOf(k) : "null")
						.append(",\"expected\":").append(str(ref.getEReferenceType().getName()))
						.append(",\"anyType\":");
					EObject found = null;
					try {
						String name = helper.getCrossRefNodeAsString(node, true);
						if (name != null) {
							QualifiedName qn = qnc.toQualifiedName(name);
							IScope scope = scopes.getScope(o, ANY);
							IEObjectDescription d = scope.getSingleElement(qn);
							if (d != null) {
								found = d.getEObjectOrProxy();
								if (found != null && found.eIsProxy()) found = EcoreUtil.resolve(found, res);
								if (found != null && found.eIsProxy()) found = null;
							}
						}
					} catch (RuntimeException e) {
						found = null;
					}
					if (found == null) sb.append("null");
					else {
						String qname = found instanceof Element ? ((Element) found).getQualifiedName() : null;
						sb.append("{\"type\":").append(str(found.eClass().getName()))
							.append(",\"qname\":").append(qname == null ? "null" : str(qname))
							.append(",\"local\":").append(found.eResource() == res ? "true" : "false");
						if (found.eResource() == res) {
							INode fn = NodeModelUtils.getNode(found);
							if (fn != null) sb.append(",\"offset\":").append(fn.getOffset()).append(",\"length\":").append(fn.getLength());
						}
						sb.append('}');
					}
					sb.append('}');
				}
			}
		}
		return n;
	}

	// 要素の種類と節点の範囲と持ち主の型を書く。節点がなければ最も近い祖先の節点を使い、implicit を true にする
	static void nodeOf(EObject o, StringBuilder sb) {
		if (o == null) { sb.append("null"); return; }
		EObject a = o;
		INode node = null;
		while (a != null && (node = NodeModelUtils.getNode(a)) == null) a = a.eContainer();
		sb.append("{\"type\":").append(str(o.eClass().getName()))
			.append(",\"implicit\":").append(a == o ? "false" : "true");
		if (node != null) sb.append(",\"offset\":").append(node.getOffset()).append(",\"length\":").append(node.getLength());
		EObject t = o.eContainer();
		while (t != null && !(t instanceof Type)) t = t.eContainer();
		sb.append(",\"owner\":").append(t == null ? "null" : str(t.eClass().getName()));
		sb.append('}');
	}

	static String str(String s) {
		StringBuilder b = new StringBuilder("\"");
		for (int i = 0; i < s.length(); i++) {
			char c = s.charAt(i);
			switch (c) {
				case '"': b.append("\\\""); break;
				case '\\': b.append("\\\\"); break;
				case '\n': b.append("\\n"); break;
				case '\r': b.append("\\r"); break;
				case '\t': b.append("\\t"); break;
				default:
					if (c < 0x20) b.append(String.format("\\u%04x", (int) c));
					else b.append(c);
			}
		}
		return b.append('"').toString();
	}
}
