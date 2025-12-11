import os
import csv
import json
import secrets
import string

# Configuración
MUNICIPIOS_TSV = os.path.join("data", "municipios.tsv")
OUTPUT_FILE = "municipios_credenciales_PRIVADO.json" # NO SUBIR A GITHUB

def generar_codigo(longitud=8):
    # Letras (mayus/minus) + Números. Sin espacios ni símbolos raros.
    caracteres = string.ascii_letters + string.digits
    # Excluimos caracteres confusos (l, I, 1, O, 0) para evitar errores de lectura
    caracteres = caracteres.translate(str.maketrans('', '', 'lI1O0'))
    return ''.join(secrets.choice(caracteres) for i in range(longitud))

def main():
    if not os.path.exists(MUNICIPIOS_TSV):
        print(f"❌ Error: No encuentro {MUNICIPIOS_TSV}")
        return

    credenciales = {}
    
    print("⚙️ Generando códigos seguros por municipio...")
    
    with open(MUNICIPIOS_TSV, "r", encoding="utf-8", errors="replace") as f:
        tsv_reader = csv.reader(f, delimiter='\t')
        for row in tsv_reader:
            if len(row) >= 2 and row[0].strip():
                try:
                    # Código normalizado (ej: "066")
                    code = str(int(row[0].strip()[-3:])).zfill(3)
                    name = row[1].strip()
                    
                    # Generamos código único
                    password = generar_codigo()
                    
                    credenciales[code] = {
                        "nombre": name,
                        "clave": password
                    }
                    print(f"   Generating for {name} ({code})...")
                except ValueError: pass

    # Guardar en JSON
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(credenciales, f, indent=4, ensure_ascii=False)

    print(f"\n✅ Archivo generado: {OUTPUT_FILE}")
    print("⚠️  IMPORTANTE: No subas este archivo a GitHub. Es tu lista maestra.")
    print("    Envía cada código a su respectivo ayuntamiento.")

if __name__ == "__main__":
    main()