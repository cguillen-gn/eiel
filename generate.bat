@echo off
title Generador de Formularios EIEL
setlocal

echo ====================================================
echo   PROCESO DE GENERACION DE FORMULARIOS EIEL
echo ====================================================
echo.

:: 1. Limpieza de archivos HTML antiguos
:: Solo borramos los .html para no afectar a las subcarpetas de assets/css/img
echo [1/2] Eliminando archivos HTML antiguos en docs/...
if exist docs\*.html (
    del /q docs\*.html
    echo      ^> Archivos antiguos eliminados correctamente.
) else (
    echo      ^> No se encontraron archivos HTML para eliminar.
)

echo.

:: 2. Ejecucion del script de Python
echo [2/2] Ejecutando gen_forms.py...
python gen_forms.py

echo.
echo ====================================================
echo   PROCESO COMPLETADO
echo ====================================================
echo.
pause