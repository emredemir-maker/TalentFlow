@echo off
echo TalentFlow AI Scraper Baslatiliyor...
echo.
set /p query="Lutfen aranacak pozisyonu girin (Ornek: Senior React Developer Istanbul): "
echo.
echo '%query%' icin internet taramasi baslatiliyor...
echo Lutfen bekleyin, tarayici arkada calisacak...
echo.
call node cli-scraper.mjs "%query%"
echo.
echo Islem tamamlandi. Pencereyi kapatabilirsiniz.
pause
