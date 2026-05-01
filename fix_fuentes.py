from db import get_connection

conn = get_connection()
cur = conn.cursor()

# Eliminar medios obsoletos que ya no tienen RSS funcional
cur.execute("""
    DELETE FROM fuentes
    WHERE nombre IN (
        'Sin Embargo', 'Proceso', 'Milenio', 'El Heraldo',
        'SDP Noticias', 'Infobae México', 'El Economista'
    );
""")

conn.commit()
cur.close()
conn.close()
print("Medios obsoletos eliminados.")

# Insertar los medios actuales desde config.py
from config import FUENTES
from db import insertar_fuentes
insertar_fuentes(FUENTES)
print("Medios actuales verificados en BD.")
