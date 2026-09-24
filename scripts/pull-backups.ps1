<#
  Копия бэкапов боевой базы на этой машине — требование PRD «копия вне сервера с базой».

  Сервер сам выгружает базу в /opt/buscom-erp/backups (scripts/backup-db.sh по cron):
  ежедневно без картинок и по воскресеньям только картинки. Этот скрипт забирает
  по SSH файлы, которых здесь ещё нет, и хранит последние $KeepDaily ежедневных
  и $KeepImages выгрузок картинок. Пропущенные дни (машина была выключена, мешал VPN)
  догружаются при следующем запуске: на сервере файлы лежат 30 дней.

    .\scripts\pull-backups.ps1             # скачать сейчас
    .\scripts\pull-backups.ps1 -Register   # завести ежедневный запуск в Планировщике заданий

  Нужен хост `buscom-prod` в ~/.ssh/config (docs/DEPLOY.md). Лог — pull-backups.log
  в папке с копиями. В копиях персональные данные клиентов: папка должна лежать
  на зашифрованном диске.
#>
param(
  [string]$Destination = "C:\Job\buscom\backups",
  [string]$SshHost = "buscom-prod",
  [string]$RemoteDir = "/opt/buscom-erp/backups",
  [int]$KeepDaily = 30,
  [int]$KeepImages = 2,
  [switch]$Register
)

$ErrorActionPreference = "Stop"
$TaskName = "BusCom ERP — копия бэкапов"

if ($Register) {
  $action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$PSCommandPath`" -Destination `"$Destination`""
  $trigger = New-ScheduledTaskTrigger -Daily -At "10:00"
  # StartWhenAvailable — если в 10:00 машина была выключена, задание запустится после включения.
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2) -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
    -Description "Скачивает бэкапы базы BusCom ERP с сервера в $Destination (scripts/pull-backups.ps1)" -Force | Out-Null
  Write-Output "Задание «$TaskName» заведено: ежедневно в 10:00, пропущенный запуск — после включения машины."
  exit 0
}

$LogFile = Join-Path $Destination "pull-backups.log"
# Файл моложе этого может ещё дописываться бэкапом на сервере (выгрузка картинок идёт около минуты).
$MinAgeSeconds = 15 * 60

function Write-Log([string]$Message) {
  $line = "{0:yyyy-MM-dd HH:mm:ss} {1}" -f (Get-Date), $Message
  Add-Content -Path $LogFile -Value $line -Encoding UTF8
  Write-Output $line
}

# Оставляет $Keep самых свежих файлов по маске: дата выгрузки — в имени файла.
function Remove-OldBackups([string]$Pattern, [int]$Keep) {
  Get-ChildItem -Path $Destination -Filter $Pattern |
    Sort-Object Name -Descending |
    Select-Object -Skip $Keep |
    ForEach-Object {
      Remove-Item -LiteralPath $_.FullName -Force
      Write-Log "удалён старый $($_.Name)"
    }
}

New-Item -ItemType Directory -Force -Path $Destination | Out-Null

try {
  # Имя, размер и время изменения каждого файла, последней строкой — время сервера.
  $listing = & ssh -o BatchMode=yes -o ConnectTimeout=20 $SshHost `
    "cd $RemoteDir && stat -c '%n %s %Y' buscom_*.sql.gz buscom-images_*.sql.gz 2>/dev/null; date +%s"
  if ($LASTEXITCODE -ne 0) {
    throw "сервер недоступен (ssh, код $LASTEXITCODE). Включён VPN?"
  }

  $lines = @($listing)
  $serverNow = [long]$lines[-1]
  $downloaded = 0
  $present = 0

  foreach ($entry in ($lines | Select-Object -SkipLast 1)) {
    $name, $size, $mtime = $entry -split " "
    $size = [long]$size
    if ($serverNow - [long]$mtime -lt $MinAgeSeconds) {
      Write-Log "пропущен $name — ещё пишется на сервере"
      continue
    }

    $target = Join-Path $Destination $name
    if ((Test-Path -LiteralPath $target) -and (Get-Item -LiteralPath $target).Length -eq $size) {
      $present++
      continue
    }

    # Качаем во временный файл: оборванная загрузка не должна выглядеть готовой копией.
    $part = "$target.part"
    & scp -q -o BatchMode=yes -o ConnectTimeout=20 "${SshHost}:$RemoteDir/$name" $part
    if ($LASTEXITCODE -ne 0) {
      throw "не скачался $name (scp, код $LASTEXITCODE)"
    }
    $gotSize = (Get-Item -LiteralPath $part).Length
    if ($gotSize -ne $size) {
      Remove-Item -LiteralPath $part -Force
      throw "не совпал размер $name`: на сервере $size, скачано $gotSize"
    }
    Move-Item -LiteralPath $part -Destination $target -Force
    Write-Log ("скачан {0} ({1:N1} МБ)" -f $name, ($size / 1MB))
    $downloaded++
  }

  Remove-OldBackups "buscom_*.sql.gz" $KeepDaily
  Remove-OldBackups "buscom-images_*.sql.gz" $KeepImages
  Get-ChildItem -Path $Destination -Filter "*.part" | Remove-Item -Force

  Write-Log "готово: скачано $downloaded, уже были $present"
  exit 0
}
catch {
  Write-Log "ОШИБКА: $($_.Exception.Message)"
  exit 1
}
