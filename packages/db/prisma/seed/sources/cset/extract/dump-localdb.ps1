<#
.SYNOPSIS
  Dumps the CSET content tables from a CSET LocalDB (standalone install) to CSV files
  that extract/index.ts reads with --csv. One file per table, header row = column names.

.EXAMPLE
  pwsh extract/dump-localdb.ps1 -OutDir C:\Users\me\Downloads\cset-db
  pwsh extract/dump-localdb.ps1 -OutDir ... -ConnectionString 'data source=(localdb)\INLLocalDb2022;initial catalog=CSETWeb;Integrated Security=SSPI;Encrypt=false'
#>
param(
  [Parameter(Mandatory = $true)] [string] $OutDir,
  [string] $ConnectionString = 'data source=(localdb)\INLLocalDb2022;initial catalog=CSETWeb;Integrated Security=SSPI;Encrypt=false'
)

$ErrorActionPreference = 'Stop'
# Keep in step with TABLE_KEYS in replay.ts.
$tables = @(
  'MATURITY_MODELS', 'MATURITY_LEVELS', 'MATURITY_GROUPINGS', 'MATURITY_QUESTIONS',
  'MATURITY_ANSWER_OPTIONS', 'MATURITY_QUESTION_PROPS', 'MATURITY_REFERENCES',
  'MATURITY_REFERENCE_TEXT', 'MATURITY_SUB_MODEL_QUESTIONS', 'GEN_FILE', 'SETS',
  'NEW_REQUIREMENT', 'REQUIREMENT_SETS', 'REQUIREMENT_REFERENCES', 'REQUIREMENT_SOURCE_FILES',
  'GALLERY_ITEM'
)

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$conn = New-Object System.Data.SqlClient.SqlConnection $ConnectionString
$conn.Open()
try {
  $version = $conn.CreateCommand()
  $version.CommandText = 'SELECT TOP 1 Cset_Version FROM CSET_VERSION'
  $csetVersion = [string] $version.ExecuteScalar()
  Set-Content -Path (Join-Path $OutDir 'VERSION.txt') -Value $csetVersion -Encoding utf8 -NoNewline
  foreach ($t in $tables) {
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = "SELECT * FROM [dbo].[$t]"
    try { $reader = $cmd.ExecuteReader() } catch {
      # Older or newer schemas may lack a table (v13 has no REQUIREMENT_SOURCE_FILES); skip it.
      Write-Host ("{0,-32} absent, skipped" -f $t)
      continue
    }
    $table = New-Object System.Data.DataTable
    $table.Load($reader)
    $reader.Close()
    # Export-Csv quotes every field and writes CRLF; the extractor's parser handles both.
    $table | Export-Csv -Path (Join-Path $OutDir "$t.csv") -NoTypeInformation -Encoding utf8
    Write-Host ("{0,-32} {1,6} rows" -f $t, $table.Rows.Count)
  }
  Write-Host "CSET $csetVersion dumped to $OutDir"
} finally {
  $conn.Close()
}
