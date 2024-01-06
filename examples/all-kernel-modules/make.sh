while true; do
  elm make src/Main.elm --debug --output=build/main.debug.js
#   elm make src/Main.elm --output=build/main.js
#   elm make src/Main.elm --optimize --output=build/main.optimize.js
  inotifywait --quiet --recursive src/*
done
