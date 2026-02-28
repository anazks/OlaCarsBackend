import sys
import zipfile
import xml.etree.ElementTree as ET

def extract_text():
    path = r"C:\Users\leno2\Downloads\ola_cars_vehicle_onboarding.docx"
    out_path = r"C:\Users\leno2\Desktop\OlaCarsBackend\docx_output.txt"
    try:
        document = zipfile.ZipFile(path)
        xml_content = document.read('word/document.xml')
        document.close()
        tree = ET.XML(xml_content)
        word_schema = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
        paragraphs = []
        for paragraph in tree.iter("{%s}p" % word_schema):
            texts = [node.text for node in paragraph.iter("{%s}t" % word_schema) if node.text]
            if texts:
                paragraphs.append("".join(texts))
                
        with open(out_path, "w", encoding="utf-8") as f:
            f.write("\n".join(paragraphs))
            
    except Exception as e:
        with open(out_path, "w", encoding="utf-8") as f:
            f.write("ERROR: " + str(e))

extract_text()
