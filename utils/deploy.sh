if [ "$1" == "prod" ] ; then
   if [ "$2" != "confirm" ] && [ "$3" != "confirm" ]  && [ "$4" != "confirm" ]; then
      echo "Must add 'confirm' to deploy to prod"
      exit 1
   fi
   HOST="root@136.243.174.166"
else
   echo "Must specify environment (prod)"
   exit 1
fi

FOLDER="vibey"

wc -l client.js client-css.js server.js test-client.js test-server.js website.js secret.js utils/deploy.sh

if [ "$2" == "website" ] ; then
   scp new-website.html $HOST:/var/www/html/website.html
   #node website
   #scp website.html $HOST:/var/www/html
   #ssh $HOST "mkdir -p /var/www/html/video"
   #rsync -av video/ $HOST:/var/www/html/video/
   exit 0
fi

if [ "$2" == "sandbox" ] ; then
   ssh $HOST "docker ps -aq --filter ancestor=vibey-sandbox:latest | xargs -r docker rm -f && docker rmi -f vibey-sandbox:latest || true"
fi

rsync -av --exclude video . $HOST:$FOLDER
ssh $HOST chown -R root /root/$FOLDER

ssh $HOST "cd $FOLDER && docker build -t vibey-sandbox:latest -f Dockerfile.sandbox ."
ssh $HOST "cd $FOLDER && node -e \"var fs=require('fs'); var path='secret.json'; var data=JSON.parse(fs.readFileSync(path, 'utf8')); data.domain='https://buildwithvibey.com/app'; fs.writeFileSync(path, JSON.stringify(data, null, 2) + '\\n');\" && VIBEY_CLOUD=1 VIBEY_TRIGGER_EMAIL_DOMAIN=buildwithvibey.com docker compose up --build -d"
