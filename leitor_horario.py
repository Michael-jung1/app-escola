import streamlit as st
import pandas as pd
import pdfplumber

# Dicionário inteligente atualizado com as matérias do PDF
SIGLAS = {
    'BIO': 'Biologia', 'ED.F': 'Ed. Física', 'ED.F.': 'Ed. Física',
    'PORT': 'Português', 'ART': 'Artes', 'MAT': 'Matemática',
    'GEO': 'Geografia', 'SOC': 'Sociologia', 'HIST': 'História',
    'FIL': 'Filosofia', 'ING': 'Inglês', 'FIS': 'Física',
    'QUI': 'Química', 'ESP': 'Espanhol', 'BIOLOGIA': 'Biologia'
}

def parse_cell(texto):
    linhas = [x.strip() for x in str(texto).split('\n') if x.strip()]
    pares = []
    materia_atual = None
    prof_atual = []
    
    for linha in linhas:
        sigla = linha.split(" ")[0].upper()
        if sigla in SIGLAS or sigla == "LIVRE":
            if materia_atual is not None:
                pares.append((materia_atual, " ".join(prof_atual).strip()))
            materia_atual = SIGLAS.get(sigla, "Livre")
            prof_atual = []
            
            resto = linha[len(sigla):].strip()
            if resto:
                prof_atual.append(resto)
        else:
            if materia_atual is not None:
                prof_atual.append(linha)
            else:
                pares.append(("", linha))
                
    if materia_atual is not None:
        pares.append((materia_atual, " ".join(prof_atual).strip()))
        
    return pares

def extrair_horario_inteligente(arquivo_pdf, turma_alvo):
    dias = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"]
    horarios_padrao = ["13:00", "13:45", "14:30", "15:30", "16:15", "17:00"]
    
    grade = {h: {d: {"materia": "Livre", "prof": ""} for d in dias} for h in horarios_padrao}
    
    with pdfplumber.open(arquivo_pdf) as pdf:
        for page in pdf.pages:
            texto = page.extract_text()
            # Esta verificação garante que a página contenha a turma alvo
            if not texto or f"Turma: {turma_alvo}" not in texto:
                continue
            
            tabelas = page.extract_tables()
            
            # Aqui, dividimos o texto da página por "Turma:" para encontrar o bloco da turma correta
            blocos_turma = texto.split("Turma:")
            indice_tabela_alvo = -1
            
            # Conta as tabelas válidas encontradas
            tabelas_validas = [t for t in tabelas if t and t[0] and "Hor" in str(t[0][0])]
            
            for i, bloco in enumerate(blocos_turma[1:]): # Ignora o texto antes da primeira turma
                 if turma_alvo in bloco:
                     indice_tabela_alvo = i
                     break
                     
            if indice_tabela_alvo != -1 and indice_tabela_alvo < len(tabelas_validas):
                tabela_alvo = tabelas_validas[indice_tabela_alvo]
            else:
                continue # Se não achou a tabela correspondente, continua a busca
                
            current_times = []
            for linha in tabela_alvo[1:]: # Processa a tabela encontrada
                texto_horario = str(linha[0]).strip() if linha[0] else ""
                horarios_na_linha = [h.strip() for h in texto_horario.split("\n") if ":" in h]
                
                is_continuation = False
                if horarios_na_linha:
                    current_times = horarios_na_linha
                else:
                    is_continuation = True
                    
                for i, dia in enumerate(dias):
                    col = i + 1
                    celula = str(linha[col]) if col < len(linha) and linha[col] else ""
                    pares = parse_cell(celula)
                    
                    if is_continuation:
                        for idx, (sub, prof) in enumerate(pares):
                            if idx < len(current_times) and prof:
                                h = current_times[idx]
                                grade[h][dia]["prof"] = (grade[h][dia]["prof"] + " " + prof).strip()
                    else:
                        for idx, (sub, prof) in enumerate(pares):
                            if idx < len(current_times):
                                h = current_times[idx]
                                if sub: grade[h][dia]["materia"] = sub
                                if prof: grade[h][dia]["prof"] = prof
                                    
            resultado = []
            for h in horarios_padrao:
                linha_formatada = {"Horário": h}
                for d in dias:
                    mat = grade[h][d]["materia"]
                    prof = grade[h][d]["prof"]
                    if mat == "Livre" or not mat:
                        linha_formatada[d] = "Livre"
                    else:
                        p_nome = prof.title() if prof else "Não Informado"
                        linha_formatada[d] = f"{mat} | {p_nome}"
                resultado.append(linha_formatada)
            
            return pd.DataFrame(resultado)
            
    return None

st.set_page_config(page_title="Leitor de Horário Escolar", layout="wide")
st.link_button("⬅️ Voltar para o App Principal", "https://app-organizacao-escolar.vercel.app/")

st.title("📚 Extrator de Horários Automático")
st.write("Arraste seu PDF gerado pelo Urania. O sistema mapeará as matérias e os professores perfeitamente.")

arquivo_enviado = st.file_uploader("Arraste e solte o seu PDF aqui", type=["pdf"])
turma_selecionada = st.selectbox("Selecione sua Turma:", [
    "104", "105", "106", "107", "108", "109", "206", "207", "208", "209", "305", "306"
])

if st.button("Extrair Meu Horário"):
    if arquivo_enviado is not None:
        with st.spinner('Analisando as grades do PDF...'):
            df_horario = extrair_horario_inteligente(arquivo_enviado, turma_selecionada)
            
            if df_horario is not None and not df_horario.empty:
                st.success(f"🎉 Horário da Turma {turma_selecionada} mapeado com sucesso!")
                st.dataframe(df_horario, use_container_width=True)
                
                st.download_button(
                    label="Baixar em JSON para o App",
                    data=df_horario.to_json(orient="records"),
                    file_name=f"horario_turma_{turma_selecionada}.json",
                    mime="application/json"
                )
            else:
                st.error("Turma não encontrada ou PDF com formato inválido.")
    else:
        st.warning("Envie o arquivo PDF primeiro!")
