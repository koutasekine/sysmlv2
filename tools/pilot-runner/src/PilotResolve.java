// パイロット実装(SysML-v2-Pilot-Implementation、タグ 2026-03)が、原文の各参照をどの要素に解決したかを書き出す
// 照合用の実行器(GR3 指示書 7 章)。
// SPDX-License-Identifier: MIT
//
// 使い方:
//   java -cp <パイロット実装の成果物>:<このクラス> PilotResolve --out <出力先> --library <標準ライブラリのフォルダ>
//        [--base <基準のフォルダ>] <.sysml ファイル または ファイル一覧(@一覧.txt)>...
//
// 標準ライブラリ(.sysml と .kerml)をすべて 1 つの資源の集合に読み込み、その上で各ファイルを読む。
// ファイルが標準ライブラリの中のものなら、読み込み済みの資源をそのまま使う。それ以外は、読んで調べた後に資源の集合から外す
// (例題どうしの参照は解決しない)。
// ファイルごとに <出力先>/files/<基準からの相対パス>.json を書く。中身:
//   file        入力ファイル
//   refs        原文に書かれた参照(Xtext の節点を持つ、所有でない参照)の一覧。1 つの参照:
//     offset, length, text  参照の節点の範囲(先頭の空白と注を除く)と字句
//     source      参照を持つ要素のメタクラス名
//     feature     参照の属性名。index は一覧の属性なら何番目か
//     target      解決先。null(解決できない)か、次のどれか:
//                   { "local": { offset, length, type, name } }   このファイルの要素(節点の範囲。name は実効の名前)
//                   { "implicit": { type, name, owner: {offset, length, type} } }  このファイルの、原文にない暗黙の要素
//                   { "library": { qname, type, uri } }   標準ライブラリの要素
//                   { "membership": 上のどれか, "memberElement": 上のどれか }   解決先が Membership のとき(MembershipImport)
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
import org.eclipse.xtext.nodemodel.INode;
import org.eclipse.xtext.nodemodel.util.NodeModelUtils;
import org.eclipse.xtext.resource.XtextResource;
import org.eclipse.xtext.resource.XtextResourceSet;
import org.omg.kerml.xtext.KerMLStandaloneSetup;
import org.omg.sysml.lang.sysml.Element;
import org.omg.sysml.lang.sysml.Membership;
import org.omg.sysml.lang.sysml.SysMLPackage;
import org.omg.sysml.xtext.SysMLStandaloneSetup;

import com.google.inject.Injector;

public class PilotResolve {

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
			System.err.println("使い方: PilotResolve --out <出力先> --library <標準ライブラリ> [--base <基準>] <ファイル または @一覧>...");
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

		int done = 0, failed = 0, totalRefs = 0;
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
				sb.append(",\"refs\":[");
				int n = refs(res, sb);
				totalRefs += n;
				sb.append(']');
			} catch (Throwable e) {
				exception = e.toString();
				sb.append(",\"refs\":null");
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
			+ ",\"refs\":" + totalRefs + ",\"libraryFiles\":" + libFiles.size() + ",\"libraryMillis\":" + libMillis
			+ ",\"resolveMillis\":" + millis + "}\n";
		Files.createDirectories(out);
		Files.writeString(out.resolve("summary.json"), summary, StandardCharsets.UTF_8);
		System.out.println("files=" + inputs.size() + " done=" + done + " exceptions=" + failed + " refs=" + totalRefs
			+ " libraryFiles=" + libFiles.size() + " libraryMillis=" + libMillis + " resolveMillis=" + millis);
	}

	// 資源の中の、原文に節点を持つ所有でない参照を書き出す。書いた数を返す
	static int refs(Resource res, StringBuilder sb) {
		int n = 0;
		TreeIterator<EObject> it = res.getAllContents();
		while (it.hasNext()) {
			EObject o = it.next();
			for (EReference ref : o.eClass().getEAllReferences()) {
				if (ref.isContainment() || ref.isContainer()) continue;
				List<INode> nodes = NodeModelUtils.findNodesForFeature(o, ref);
				if (nodes.isEmpty()) continue;
				Object v = o.eGet(ref, true);
				List<?> values = ref.isMany() ? (List<?>) v : Collections.singletonList(v);
				for (int k = 0; k < nodes.size(); k++) {
					INode node = nodes.get(k);
					Object t = k < values.size() ? values.get(k) : null;
					if (n > 0) sb.append(',');
					n++;
					sb.append("{\"offset\":").append(node.getOffset())
						.append(",\"length\":").append(node.getLength())
						.append(",\"text\":").append(str(NodeModelUtils.getTokenText(node)))
						.append(",\"source\":").append(str(o.eClass().getName()))
						.append(",\"feature\":").append(str(ref.getName()))
						.append(",\"index\":").append(ref.isMany() ? String.valueOf(k) : "null")
						.append(",\"target\":");
					describe(t instanceof EObject ? (EObject) t : null, res, sb);
					sb.append('}');
				}
			}
		}
		return n;
	}

	static void describe(EObject t, Resource here, StringBuilder sb) {
		describe(t, here, sb, true);
	}

	// Membership が解決先のとき(MembershipImport の importedMembership)は、memberElement も書く
	static void describe(EObject t, Resource here, StringBuilder sb, boolean withMember) {
		if (t == null || t.eIsProxy()) { sb.append("null"); return; }
		if (withMember && t instanceof Membership) {
			sb.append("{\"membership\":");
			describe(t, here, sb, false);
			sb.append(",\"memberElement\":");
			describe(((Membership) t).getMemberElement(), here, sb, false);
			sb.append('}');
			return;
		}
		String name = t instanceof Element ? ((Element) t).getName() : null;
		if (t.eResource() == here) {
			INode node = NodeModelUtils.getNode(t);
			if (node != null) {
				sb.append("{\"local\":{\"offset\":").append(node.getOffset()).append(",\"length\":").append(node.getLength())
					.append(",\"type\":").append(str(t.eClass().getName()))
					.append(",\"name\":").append(name == null ? "null" : str(name)).append("}}");
			} else {
				EObject owner = t.eContainer();
				INode on = null;
				while (owner != null && (on = NodeModelUtils.getNode(owner)) == null) owner = owner.eContainer();
				sb.append("{\"implicit\":{\"type\":").append(str(t.eClass().getName()))
					.append(",\"name\":").append(name == null ? "null" : str(name))
					.append(",\"owner\":");
				if (on == null) sb.append("null");
				else sb.append("{\"offset\":").append(on.getOffset()).append(",\"length\":").append(on.getLength())
					.append(",\"type\":").append(str(owner.eClass().getName())).append('}');
				sb.append("}}");
			}
		} else {
			String qn = t instanceof Element ? ((Element) t).getQualifiedName() : null;
			String uri = t.eResource() == null ? null : t.eResource().getURI().lastSegment();
			sb.append("{\"library\":{\"qname\":").append(qn == null ? "null" : str(qn))
				.append(",\"type\":").append(str(t.eClass().getName()))
				.append(",\"name\":").append(name == null ? "null" : str(name))
				.append(",\"uri\":").append(uri == null ? "null" : str(uri)).append("}}");
		}
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
