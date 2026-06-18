@echo off
title Bruna - bot WhatsApp (NAO FECHE / pode minimizar)
cd /d "%~dp0"
:loop
echo ============================================================
echo  Iniciando a Bruna... mantenha esta janela ABERTA (minimize).
echo  Fechar esta janela desliga o bot.
echo ============================================================
echo.
call npm start
echo.
echo ============================================================
echo  A Bruna parou. Reiniciando em 10 segundos...
echo  (se ficar repetindo sem parar, me chame e mande o erro acima)
echo ============================================================
timeout /t 10 >nul
goto loop
