// パイロット実装(SysML-v2-Pilot-Implementation、タグ 2026-03)の解析器を呼ぶ照合用の実行器(GR1 指示書 5.2 節)。
// SPDX-License-Identifier: MIT
//
// 使い方:
//   java -cp <パイロット実装の成果物>:<このクラス> PilotRunner --out <出力先> [--base <基準のフォルダ>] <.sysml ファイル または ファイル一覧(@一覧.txt)>...
//
// ファイルごとに <出力先>/<基準からの相対パス>.json を書く。中身:
//   file          入力ファイル
//   syntaxErrors  構文エラー(行・列・オフセット・長さ・内容)。IParseResult.getSyntaxErrors() だけを使い、
//                 リンク(名前解決)と検証のエラーは含めない
//   tree          要素の種類(メタクラス名)と名前の木。Element.ownedRelationship を owned、
//                 Relationship.ownedRelatedElement を related として、所有の木をたどる
//   parseMillis   読み込み(構文解析)にかかった時間(ミリ秒)
//   exception     解析中に例外が出たとき、その内容
// 全体の要約を <出力先>/summary.json に書く。
// 標準ライブラリは読み込まない。ファイルごとに新しい資源の集合を使い、ファイルどうしの参照は解決しない。

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import org.eclipse.emf.common.util.URI;
import org.eclipse.emf.ecore.EObject;
import org.eclipse.emf.ecore.EPackage;
import org.eclipse.emf.ecore.resource.Resource;
import org.eclipse.xtext.nodemodel.INode;
import org.eclipse.xtext.parser.IParseResult;
import org.eclipse.xtext.resource.XtextResource;
import org.eclipse.xtext.resource.XtextResourceSet;
import org.omg.sysml.lang.sysml.Element;
import org.omg.kerml.xtext.KerMLStandaloneSetup;
import org.omg.sysml.lang.sysml.Relationship;
import org.omg.sysml.lang.sysml.SysMLPackage;
import org.omg.sysml.xtext.SysMLStandaloneSetup;

import com.google.inject.Injector;

public class PilotRunner {

	public static void main(String[] args) throws Exception {
		Path out = null;
		Path base = null;
		List<Path> inputs = new ArrayList<>();
		for (int i = 0; i < args.length; i++) {
			if (args[i].equals("--out")) out = Paths.get(args[++i]);
			else if (args[i].equals("--base")) base = Paths.get(args[++i]).toAbsolutePath().normalize();
			else if (args[i].startsWith("@")) {
				for (String line : Files.readAllLines(Paths.get(args[i].substring(1)), StandardCharsets.UTF_8)) {
					if (!line.isBlank()) inputs.add(Paths.get(line.trim()));
				}
			} else inputs.add(Paths.get(args[i]));
		}
		if (out == null || inputs.isEmpty()) {
			System.err.println("使い方: PilotRunner --out <出力先> [--base <基準>] <ファイル または @一覧>...");
			System.exit(2);
		}

		long t0 = System.nanoTime();
		// パイロット実装の SysMLInteractive.createInstance() と同じ順で初期化する(XMI 用の設定は使わないので省く)。
		EPackage.Registry.INSTANCE.put(SysMLPackage.eNS_URI, SysMLPackage.eINSTANCE);
		KerMLStandaloneSetup.doSetup();
		Injector injector = new SysMLStandaloneSetup().createInjectorAndDoEMFRegistration();
		long setupMillis = (System.nanoTime() - t0) / 1_000_000;

		int accepted = 0, rejected = 0, failed = 0;
		long totalParse = 0;
		StringBuilder rows = new StringBuilder();
		for (Path in : inputs) {
			Path abs = in.toAbsolutePath().normalize();
			String rel = base != null && abs.startsWith(base) ? base.relativize(abs).toString() : abs.getFileName().toString();
			StringBuilder sb = new StringBuilder();
			sb.append("{\"file\":").append(str(rel));
			int nErrors = -1;
			String exception = null;
			long ms = 0;
			try {
				XtextResourceSet rs = injector.getInstance(XtextResourceSet.class);
				Resource res = rs.createResource(URI.createFileURI(abs.toString()));
				long s = System.nanoTime();
				res.load(Collections.singletonMap(XtextResource.OPTION_ENCODING, "UTF-8"));
				ms = (System.nanoTime() - s) / 1_000_000;
				totalParse += ms;
				IParseResult pr = ((XtextResource) res).getParseResult();
				String text = pr.getRootNode().getText();
				List<INode> errs = new ArrayList<>();
				for (INode n : pr.getSyntaxErrors()) errs.add(n);
				nErrors = errs.size();
				sb.append(",\"syntaxErrors\":[");
				for (int k = 0; k < errs.size(); k++) {
					INode n = errs.get(k);
					if (k > 0) sb.append(',');
					int off = n.getOffset();
					int lineStart = text.lastIndexOf('\n', Math.max(0, off - 1)) + 1;
					sb.append("{\"line\":").append(n.getStartLine())
						.append(",\"column\":").append(off - lineStart + 1)
						.append(",\"offset\":").append(off)
						.append(",\"length\":").append(n.getLength())
						.append(",\"message\":").append(str(n.getSyntaxErrorMessage().getMessage()))
						.append('}');
				}
				sb.append(']');
				sb.append(",\"tree\":[");
				boolean first = true;
				for (EObject o : res.getContents()) {
					if (!first) sb.append(',');
					first = false;
					tree(o, sb);
				}
				sb.append(']');
			} catch (Throwable e) {
				exception = e.toString();
				sb.append(",\"syntaxErrors\":null,\"tree\":null");
			}
			sb.append(",\"parseMillis\":").append(ms);
			sb.append(",\"exception\":").append(exception == null ? "null" : str(exception));
			sb.append("}\n");
			Path dest = out.resolve("files").resolve(rel + ".json");
			Files.createDirectories(dest.getParent());
			Files.writeString(dest, sb.toString(), StandardCharsets.UTF_8);

			String result = exception != null ? "exception" : nErrors == 0 ? "accept" : "reject";
			if (exception != null) failed++; else if (nErrors == 0) accepted++; else rejected++;
			if (rows.length() > 0) rows.append(",\n");
			rows.append("  {\"file\":").append(str(rel)).append(",\"result\":").append(str(result))
				.append(",\"syntaxErrors\":").append(nErrors).append(",\"parseMillis\":").append(ms).append('}');
		}
		long totalMillis = (System.nanoTime() - t0) / 1_000_000;
		String summary = "{\"files\":" + inputs.size() + ",\"accepted\":" + accepted + ",\"rejected\":" + rejected
			+ ",\"exceptions\":" + failed + ",\"setupMillis\":" + setupMillis + ",\"parseMillisTotal\":" + totalParse
			+ ",\"totalMillis\":" + totalMillis + ",\"results\":[\n" + rows + "\n]}\n";
		Files.createDirectories(out);
		Files.writeString(out.resolve("summary.json"), summary, StandardCharsets.UTF_8);
		System.out.println("files=" + inputs.size() + " accepted=" + accepted + " rejected=" + rejected
			+ " exceptions=" + failed + " setupMillis=" + setupMillis + " parseMillisTotal=" + totalParse + " totalMillis=" + totalMillis);
	}

	// 所有の木を JSON にする。
	static void tree(EObject o, StringBuilder sb) {
		sb.append("{\"type\":").append(str(o.eClass().getName()));
		if (o instanceof Element) {
			Element e = (Element) o;
			if (e.getDeclaredName() != null) sb.append(",\"name\":").append(str(e.getDeclaredName()));
			if (e.getDeclaredShortName() != null) sb.append(",\"shortName\":").append(str(e.getDeclaredShortName()));
			if (!e.getOwnedRelationship().isEmpty()) {
				sb.append(",\"owned\":[");
				boolean first = true;
				for (Relationship r : e.getOwnedRelationship()) {
					if (!first) sb.append(',');
					first = false;
					tree(r, sb);
				}
				sb.append(']');
			}
			if (o instanceof Relationship && !((Relationship) o).getOwnedRelatedElement().isEmpty()) {
				sb.append(",\"related\":[");
				boolean first = true;
				for (Element c : ((Relationship) o).getOwnedRelatedElement()) {
					if (!first) sb.append(',');
					first = false;
					tree(c, sb);
				}
				sb.append(']');
			}
		}
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
